const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { readMember, LIMIT } = require("./archive.cjs");
const REFERENCED = new Set([
  "obj",
  "gltf",
  "dae",
  "fbx",
  "blend",
  "sldasm",
  "skp",
  "scad",
  "iam",
  "f3z",
]);
const key = (p) => path.resolve(p).toLowerCase();
const inside = (root, file) => {
  const relative = path.relative(root, file);
  return (
    relative === "" ||
    (!relative.startsWith(".." + path.sep) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
};
async function hashFile(file, signal) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file, { signal }))
    hash.update(chunk);
  return hash.digest("hex");
}
async function unchanged(row) {
  const s = await fsp.lstat(row.path);
  if (!s.isFile() || s.isSymbolicLink())
    throw new Error("Source is no longer a regular file. Rescan.");
  if (
    s.mtimeMs !== row.mtime ||
    (row.ctime != null && s.ctimeMs !== row.ctime) ||
    (!row.member && s.size !== row.size)
  )
    throw new Error("Source changed since scanning. Rescan before using it.");
  return s;
}
async function readRow(row) {
  if (!row) throw new Error("File not in catalog.");
  if (row.size > LIMIT)
    throw new Error(
      "Preview limit is 128 MiB. File remains available for copy and external viewing.",
    );
  await unchanged(row);
  const buffer = row.member
    ? await readMember(row.path, row.member)
    : await fsp.readFile(row.path);
  await unchanged(row);
  return buffer;
}
async function duplicates(catalog, signal, emit) {
  const rows = catalog.db
    .prepare(
      "SELECT * FROM files WHERE size IN (SELECT size FROM files GROUP BY size HAVING COUNT(*)>1) ORDER BY size",
    )
    .all();
  const state = {
    phase: "duplicates",
    running: true,
    total: rows.length,
    done: 0,
    cached: 0,
    hashed: 0,
    errors: [],
    errorCount: 0,
  };
  emit({ ...state });
  let lastEmit = Date.now();
  for (const row of rows) {
    if (signal.aborted) break;
    try {
      await unchanged(row);
      if (row.hash && row.ctime != null) {
        state.cached++;
        state.done++;
        if (Date.now() - lastEmit > 250) {
          emit({ ...state });
          lastEmit = Date.now();
        }
        continue;
      }
      const hash = row.member
        ? crypto
            .createHash("sha256")
            .update(await readRow(row))
            .digest("hex")
        : await hashFile(row.path, signal);
      await unchanged(row);
      catalog.setHash(row.id, hash);
      state.hashed++;
    } catch (e) {
      catalog.setHash(row.id, null);
      if (!signal.aborted) {
        state.errorCount++;
        if (state.errors.length < 100)
          state.errors.push({ path: row.path, message: e.message });
      }
    }
    state.done++;
    if (Date.now() - lastEmit > 250) {
      emit({ ...state });
      lastEmit = Date.now();
    }
  }
  state.running = false;
  state.phase = signal.aborted ? "cancelled" : "complete";
  catalog.setting("lastDuplicateCheck", state);
  emit({ ...state });
  return state;
}
function destinationRelative(row, layout) {
  const relative = path.relative(row.root, row.path);
  const rootName = (
    path.basename(row.root) ||
    path.parse(row.root).root.replace(/[:\\/]/g, "") ||
    "source"
  ).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  const category =
    (row.reviewedCategory || row.category || "Uncategorized")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/[. ]+$/, "") || "Uncategorized";
  const items = [
    ...(layout === "category" ? [category] : []),
    rootName,
    relative,
  ];
  if (row.member) {
    items[items.length - 1] = relative + ".contents";
    items.push(row.member.replace(/[\\/]/g, path.sep));
  }
  return path.join(...items);
}
async function rejectLinks(dir) {
  let cur = path.resolve(dir);
  while (true) {
    try {
      const s = await fsp.lstat(cur);
      if (s.isSymbolicLink()) throw new Error(`Path contains a link: ${cur}`);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
}
async function planTransfer(
  rows,
  destination,
  mode = "copy",
  layout = "folders",
  includeReferences = false,
) {
  if (
    !["copy", "move"].includes(mode) ||
    !["folders", "category"].includes(layout)
  )
    throw new Error("Invalid transfer options.");
  const dest = path.resolve(destination);
  const ds = await fsp.stat(dest);
  if (!ds.isDirectory())
    throw new Error("Choose an existing destination folder.");
  await rejectLinks(dest);
  const targets = new Set();
  const entries = [];
  const expanded = [];
  const support = new Map();
  for (const row of rows) {
    const model = { ...row, action: mode, requiredTargets: [] };
    if (includeReferences) {
      try {
        const refs = await require("./references.cjs").dependencies(row);
        if (refs) {
          model.referencesChecked = true;
          for (const ref of refs) {
            const target = path.resolve(dest, destinationRelative(ref, layout));
            model.requiredTargets.push(target);
            const supportKey = key(ref.path) + "\0" + key(target);
            if (!support.has(supportKey)) {
              support.set(supportKey, true);
              expanded.push({
                ...ref,
                id: crypto
                  .createHash("sha256")
                  .update(supportKey)
                  .digest("hex"),
                target,
                action: "copy",
              });
            }
          }
        }
      } catch (e) {
        model.referenceError = e.message;
      }
    }
    expanded.push(model);
    if (expanded.length > 20000)
      throw new Error(
        "Transfer exceeds 20,000 files including assets. Use smaller batches.",
      );
  }
  // Verify every support copy before touching any selected model.
  expanded.sort((a, b) => Number(!!b.dependency) - Number(!!a.dependency));
  for (const row of expanded) {
    const target = path.resolve(dest, destinationRelative(row, layout));
    let error = row.referenceError || "";
    let warning = "";
    if (!inside(dest, target) || key(target) === key(row.path))
      error =
        "Destination must differ from source and stay inside the chosen folder.";
    if (targets.has(key(target)))
      error =
        "Two selected files map to the same destination. Choose separate batches or a different destination.";
    targets.add(key(target));
    try {
      await fsp.lstat(target);
      error =
        "Destination already exists. Existing files are never overwritten.";
    } catch (e) {
      if (e.code !== "ENOENT") error = e.message;
    }
    try {
      await rejectLinks(path.dirname(row.path));
      await unchanged(row);
    } catch (e) {
      error = e.message;
    }
    if (row.member && mode === "move")
      error =
        "Archive entries can be copied out; moving would require rewriting the source archive.";
    if (REFERENCED.has(row.ext) && !row.referencesChecked)
      warning =
        "May depend on other files. This transfer only includes selected files. Keep related textures, materials, and assembly parts together; moving this file alone can break project references.";
    if (row.dependency)
      warning =
        "Support file copied; the original stays available to other models.";
    if (row.referencesChecked)
      warning =
        "Declared local assets included. External references beyond supported OBJ/MTL and glTF 2.0 fields are not inferred.";
    entries.push({ ...row, target, error, warning });
  }
  return {
    id: crypto.randomUUID(),
    destination: dest,
    mode,
    layout,
    includeReferences,
    entries,
    created: Date.now(),
    bytes: entries.reduce((n, r) => n + r.size, 0),
  };
}
async function executeTransfer(plan, journalPath, emit) {
  if (plan.entries.some((e) => e.error))
    throw new Error("Resolve blocked items before transferring.");
  if (Date.now() - plan.created > 15 * 60 * 1000)
    throw new Error("Transfer plan expired. Review a new plan.");
  const journal = await fsp.open(journalPath, "ax");
  const record = async (data) => {
    await journal.write(
      JSON.stringify({ at: new Date().toISOString(), plan: plan.id, ...data }) +
        "\n",
    );
    await journal.sync();
  };
  const results = [];
  const verifiedTargets = new Set();
  try {
    await record({
      event: "start",
      mode: plan.mode,
      destination: plan.destination,
    });
    for (const row of plan.entries) {
      let created = false;
      let verified = false;
      try {
        if (
          (row.requiredTargets || []).some(
            (target) => !verifiedTargets.has(key(target)),
          )
        )
          throw new Error(
            "A required asset did not copy successfully. Model source retained.",
          );
        if (
          !inside(plan.destination, row.target) ||
          key(row.path) === key(row.target)
        )
          throw new Error("Invalid destination.");
        await rejectLinks(path.dirname(row.path));
        await unchanged(row);
        await rejectLinks(path.dirname(row.target));
        await fsp.mkdir(path.dirname(row.target), { recursive: true });
        await rejectLinks(path.dirname(row.target));
        await record({
          event: "intent",
          source: row.path,
          member: row.member,
          target: row.target,
          action: row.action || plan.mode,
        });
        let sourceHash;
        if (row.member) {
          const data = await readRow(row);
          sourceHash = crypto.createHash("sha256").update(data).digest("hex");
          await fsp.writeFile(row.target, data, { flag: "wx" });
          created = true;
        } else {
          sourceHash = await hashFile(row.path);
          await unchanged(row);
          await fsp.copyFile(row.path, row.target, fs.constants.COPYFILE_EXCL);
          created = true;
        }
        const targetHandle = await fsp.open(row.target, "r+");
        try {
          await targetHandle.sync();
        } finally {
          await targetHandle.close();
        }
        const destHash = await hashFile(row.target);
        if (sourceHash !== destHash)
          throw new Error("Copy verification failed. Source retained.");
        await unchanged(row);
        if (!row.member && (await hashFile(row.path)) !== sourceHash)
          throw new Error(
            "Source content changed during transfer. Source retained.",
          );
        verified = true;
        await record({
          event: "verified",
          source: row.path,
          target: row.target,
          hash: sourceHash,
        });
        if ((row.action || plan.mode) === "move") {
          await rejectLinks(path.dirname(row.path));
          await unchanged(row);
          await fsp.unlink(row.path);
          await record({
            event: "source-removed",
            source: row.path,
            target: row.target,
          });
        } else if (!row.member) {
          const s = await fsp.stat(row.path);
          await fsp.utimes(row.target, s.atime, s.mtime).catch(() => {});
        }
        results.push({
          id: row.id,
          target: row.target,
          status: (row.action || plan.mode) === "move" ? "moved" : "copied",
        });
        verifiedTargets.add(key(row.target));
      } catch (e) {
        const result = {
          id: row.id,
          target: row.target,
          status: "failed",
          message: e.message,
          created,
          verified,
        };
        results.push(result);
        await record({ event: "failed", ...result });
      }
      emit({
        done: results.length,
        total: plan.entries.length,
        latest: results[results.length - 1],
      });
    }
    await record({ event: "finished", results });
    return { results, journalPath };
  } finally {
    await journal.close();
  }
}
module.exports = {
  hashFile,
  unchanged,
  rejectLinks,
  readRow,
  duplicates,
  planTransfer,
  executeTransfer,
  inside,
  destinationRelative,
};
