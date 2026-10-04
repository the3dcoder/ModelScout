const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const readline = require("node:readline");
const {
  hashFile,
  unchanged,
  readRow,
  inside,
  rejectLinks,
} = require("./files.cjs");
const { REFERENCE_TYPES } = require("./game-formats.cjs");
const slash = (value) => value.replaceAll("\\", "/");
const safe = (value) => {
  const name =
    String(value || "Other")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .slice(0, 55)
      .replace(/[. ]+$/, "") || "Other";
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
    ? "_" + name
    : name;
};
const relativeSafe = (value) =>
  typeof value === "string" &&
  value.length < 4096 &&
  !path.win32.isAbsolute(value) &&
  !path.posix.isAbsolute(value) &&
  !value.split(/[\\/]/).includes("..");
async function historicalPaths(roots, signal) {
  const records = new Map(),
    warnings = [];
  for (const root of roots) {
    if (signal.aborted) break;
    const file = path.join(root, "00_CATALOG", "FILE_INDEX.jsonl");
    try {
      await rejectLinks(path.dirname(file));
      const stat = await fsp.lstat(file);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size > 200 * 1024 ** 2
      )
        throw new Error(
          "Historical index is not a regular file within the 200 MiB limit.",
        );
      const stream = fs.createReadStream(file, { signal });
      const lines = readline.createInterface({
        input: stream,
        crlfDelay: Infinity,
      });
      try {
        for await (const line of lines) {
          if (signal.aborted) break;
          if (line.length > 32768)
            throw new Error("Historical index line exceeds limit.");
          const value = JSON.parse(line);
          if (
            !relativeSafe(value.destination_relative_path) ||
            !relativeSafe(value.source_relative_path)
          )
            throw new Error("Historical index contains unsafe relative paths.");
          const current = path.resolve(root, value.destination_relative_path);
          const key = current.toLowerCase();
          if (!inside(root, current) || records.has(key))
            throw new Error("Historical index contains ambiguous paths.");
          records.set(key, {
            sourceRelativePath: slash(value.source_relative_path),
            packName: String(value.pack_name || "").slice(0, 300),
            packId: String(value.pack_id || "").slice(0, 100),
            indexPath: file,
            status: "Historical path mapping; stored hashes are not trusted",
          });
        }
      } finally {
        lines.close();
        stream.destroy();
      }
      await unchanged({
        path: file,
        size: stat.size,
        mtime: stat.mtimeMs,
        ctime: stat.ctimeMs,
      });
    } catch (e) {
      if (e.code !== "ENOENT" && !signal.aborted)
        warnings.push({ path: file, message: e.message });
    }
  }
  return { records, warnings };
}
async function rowHash(row, signal) {
  await rejectLinks(path.dirname(row.path));
  await unchanged(row);
  const hash = row.member
    ? crypto
        .createHash("sha256")
        .update(await readRow(row))
        .digest("hex")
    : await hashFile(row.path, signal);
  await unchanged(row);
  return hash;
}
async function prepareLibrary(catalog, options, parent, signal, emit) {
  catalog.flush();
  const destination = await fsp.realpath(parent);
  if (!(await fsp.stat(destination)).isDirectory())
    throw new Error("Choose a destination folder.");
  await rejectLinks(parent);
  const scope = options.kind === "unique" ? { ...options, kind: "" } : options;
  const ids = catalog.ids(scope);
  if (!ids.length) throw new Error("No files match this catalog scope.");
  const roots = [...new Set(ids.map((id) => catalog.get(id).root))];
  const scannedRoots = [
    ...new Set([
      ...(catalog.setting("lastScan")?.roots || []),
      ...catalog.db
        .prepare("SELECT DISTINCT root FROM files")
        .all()
        .map((row) => row.root),
    ]),
  ];
  if (scannedRoots.some((root) => inside(root, destination)))
    throw new Error("Choose a destination outside the scanned folders.");
  const id = crypto.randomUUID();
  const directory = path.join(
    destination,
    `Asset-Library-${new Date().toISOString().replace(/[:.]/g, "-")}-${id.slice(0, 8)}`,
  );
  await fsp.mkdir(directory);
  const indexDir = path.join(directory, "indexes");
  await fsp.mkdir(indexDir);
  const handles = new Map();
  const written = new Set();
  const output = async (filename, data) => {
    let handle = handles.get(filename);
    if (!handle) {
      if (handles.size >= 24) {
        const [oldName, oldHandle] = handles.entries().next().value;
        await oldHandle.sync();
        await oldHandle.close();
        handles.delete(oldName);
      }
      handle = await fsp.open(
        path.join(directory, filename),
        written.has(filename) ? "a" : "wx",
      );
      written.add(filename);
      handles.set(filename, handle);
    }
    await handle.write(JSON.stringify(data) + "\n");
  };
  const summary = {
    schemaVersion: 1,
    id,
    created: new Date().toISOString(),
    status: "preparing",
    roots,
    filters: options,
    effectiveFilters: scope,
    files: ids.length,
    processed: 0,
    uniqueFiles: 0,
    duplicateCopies: 0,
    sourceBytes: 0,
    uniqueBytes: 0,
    redundantBytes: 0,
    referenceReview: 0,
    errorCount: 0,
    errors: [],
    historicalWarnings: [],
    categories: [],
    archivesIncluded: 0,
  };
  for (const filename of ["assets.jsonl", "sources.jsonl", "copy-plan.jsonl"]) {
    handles.set(filename, await fsp.open(path.join(directory, filename), "wx"));
    written.add(filename);
  }
  const state = () => ({
    phase: "assetCatalog",
    running: true,
    total: ids.length,
    done: summary.processed,
    errorCount: summary.errorCount,
    errors: summary.errors,
  });
  emit(state());
  const { records: history, warnings } = await historicalPaths(roots, signal);
  summary.historicalWarnings = warnings;
  const unique = new Map(),
    categories = new Map(),
    categoryMembers = new Set(),
    preview = [];
  let last = Date.now();
  const hashUpdates = [];
  const provenance = catalog.db.prepare(
    "SELECT c.name,c.creator,c.license,c.url FROM collections c JOIN collection_members m ON m.collection_id=c.id WHERE m.file_id=?",
  );
  try {
    for (let start = 0; start < ids.length && !signal.aborted; start += 4) {
      const batch = ids.slice(start, start + 4).map((id) => catalog.get(id));
      const hashes = await Promise.allSettled(
        batch.map((row) => rowHash(row, signal)),
      );
      for (let i = 0; i < batch.length; i++) {
        const row = batch[i],
          result = hashes[i];
        if (signal.aborted) break;
        summary.processed++;
        summary.sourceBytes += row.size;
        if (result.status === "rejected") {
          hashUpdates.push({ id: row.id, hash: null });
          const error = {
            path: row.path,
            member: row.member,
            message: result.reason.message,
          };
          summary.errorCount++;
          if (summary.errors.length < 30) summary.errors.push(error);
          await output("errors.jsonl", error);
          continue;
        }
        const hash = result.value;
        if (row.hash !== hash) hashUpdates.push({ id: row.id, hash });
        const category = row.reviewedCategory || row.category,
          family = row.family;
        let canonical = unique.get(hash);
        const historical = history.get(row.path.toLowerCase());
        const source = {
          id: row.id,
          name: row.name,
          extension: row.ext,
          path: row.path,
          root: row.root,
          relativePath: slash(path.relative(row.root, row.path)),
          member: row.member,
          size: row.size,
          modifiedUtc: new Date(row.mtime).toISOString(),
          sha256: hash,
          category,
          family,
          tags: row.tags,
          notes: row.notes || "",
          historical: historical || null,
          referenceReview: REFERENCE_TYPES.has(row.ext),
          collections: provenance.all(row.id),
        };
        if (!canonical) {
          const stem = safe(path.parse(row.name).name).slice(0, 36);
          const ext = /^[a-z0-9_-]{1,16}$/i.test(row.ext) ? "." + row.ext : "";
          const relative = slash(
            path.join(
              "Assets",
              safe(category),
              ...(category === family ? [] : [safe(family)]),
              hash.slice(0, 2),
              `${stem}__${hash}${ext}`,
            ),
          );
          canonical = { relative, id: row.id };
          unique.set(hash, canonical);
          const asset = {
            ...source,
            canonicalRelativePath: relative,
            copyStatus: "Planned; consult copy-receipt.json before use",
          };
          await output("assets.jsonl", asset);
          await output("copy-plan.jsonl", {
            ...row,
            expectedHash: hash,
            target: path.join(directory, relative),
          });
          summary.uniqueFiles++;
          summary.uniqueBytes += row.size;
          if (preview.length < 12)
            preview.push({
              name: row.name,
              category,
              family,
              relativePath: relative,
              size: row.size,
            });
        } else {
          summary.duplicateCopies++;
          summary.redundantBytes += row.size;
        }
        const membership = category + "\0" + hash;
        if (!categoryMembers.has(membership)) {
          categoryMembers.add(membership);
          const slug =
            safe(category) +
            "__" +
            crypto
              .createHash("sha256")
              .update(category)
              .digest("hex")
              .slice(0, 8);
          const previous = categories.get(category);
          const chunk = slash(
            path.join(
              "indexes",
              slug +
                "-" +
                String(
                  Math.floor((previous?.uniqueFiles || 0) / 1000) + 1,
                ).padStart(4, "0") +
                ".jsonl",
            ),
          );
          await output(chunk, {
            ...source,
            canonicalRelativePath: canonical.relative,
          });
          categories.set(category, {
            category,
            index: previous?.index || chunk,
            indexes: [...new Set([...(previous?.indexes || []), chunk])],
            uniqueFiles: (categories.get(category)?.uniqueFiles || 0) + 1,
          });
        }
        if (source.referenceReview) summary.referenceReview++;
        if (row.member) summary.archivesIncluded++;
        await output("sources.jsonl", {
          ...source,
          canonicalRelativePath: canonical.relative,
          canonicalId: canonical.id,
          duplicate: canonical.id !== row.id,
        });
      }
      if (hashUpdates.length >= 256) catalog.setHashes(hashUpdates.splice(0));
      if (Date.now() - last > 250) {
        last = Date.now();
        emit(state());
      }
    }
    catalog.setHashes(hashUpdates);
    summary.status = signal.aborted
      ? "cancelled"
      : summary.errorCount
        ? "incomplete"
        : "ready";
    summary.categories = [...categories.values()].sort((a, b) =>
      a.category.localeCompare(b.category),
    );
    await fsp.writeFile(
      path.join(directory, "summary.json"),
      JSON.stringify(summary, null, 2),
      { flag: "wx" },
    );
    const markdown = `# Asset library\n\nStatus: **${summary.status}**. ${summary.uniqueFiles.toLocaleString()} unique files; ${summary.duplicateCopies.toLocaleString()} extra copies indexed. Assets are **not copied yet**.\n\n## Read this first\n\n- Open summary.json for scope, counts, errors and provenance warnings. Only status ready permits a reviewed copy.\n- assets.jsonl lists one canonical asset per freshly verified SHA-256. Category indexes below are split into at most 1,000 entries each; use summary.json to locate every chunk. The same hash may appear in several category indexes but has one physical copy.\n- sources.jsonl retains every selected source path and duplicate alias, plus historical original paths where available. Historical hashes are never used for duplicate decisions.\n- copy-plan.jsonl maps verified source fingerprints to the proposed new organization under Assets/category/file family/hash prefix, combining identical category/family levels. Original filenames are shortened and given a SHA-256 suffix; files are not overwritten.\n- Consult copy-receipt.json and copy-journal.jsonl for actual copy status. Missing receipt means no copy has completed.\n- ${summary.referenceReview.toLocaleString()} source files require reference review. Paths and names change in this unique-file library. Maps, atlases, fonts and projects may require reference repair before runtime use. Their source aliases and historical paths are retained; this catalog does not rewrite them.\n- Extension and source-folder categories are suggestions, not proof of identity or Phaser compatibility. Source/editor files may require export or conversion.\n- Preserve license documents and collection provenance. No license is inferred from a filename or category. Use sources.jsonl to find each pack's documents and original paths.\n- Assets remain local; no files or catalog data are sent to a cloud service.\n\n## Category indexes\n\n${summary.categories.map((c) => `- ${c.category.replace(/[\r\n]/g, " ")}: ${c.uniqueFiles.toLocaleString()} unique assets — ${c.indexes.join(", ")}`).join("\n")}\n\n## Using this catalog in another chat\n\nGive the chat the absolute path to this START_HERE.md, then ask it to read summary.json and the relevant category index. Search sources.jsonl for original pack names, names or paths. Resolve canonicalRelativePath against this library directory; until a successful copy, use each record's path/member to locate the source. Archive members require extraction, and archive scans are opt-in. Do not assume a planned target exists.\n`;
    await fsp.writeFile(path.join(directory, "START_HERE.md"), markdown, {
      flag: "wx",
    });
    emit({
      ...state(),
      phase: summary.status === "ready" ? "complete" : summary.status,
      running: false,
    });
    return {
      id,
      directory,
      summary,
      preview,
      created: Date.now(),
      planHash: await hashFile(path.join(directory, "copy-plan.jsonl")),
    };
  } finally {
    for (const handle of handles.values()) {
      await handle.sync();
      await handle.close();
    }
  }
}
async function copyLibrary(prepared, signal, emit) {
  if (prepared.summary.status !== "ready")
    throw new Error("Prepare a complete catalog before reviewing a copy.");
  if (prepared.used)
    throw new Error("This plan has already been used. Review a new catalog.");
  if (Date.now() - prepared.created > 24 * 60 * 60 * 1000)
    throw new Error("Plan expired. Prepare and review a new catalog.");
  prepared.used = true;
  const directory = prepared.directory;
  await rejectLinks(directory);
  if (
    (await hashFile(path.join(directory, "copy-plan.jsonl"))) !==
    prepared.planHash
  )
    throw new Error("Copy plan changed. Prepare and review a new catalog.");
  const journal = await fsp.open(
    path.join(directory, "copy-journal.jsonl"),
    "ax",
  );
  const receipt = {
    id: prepared.id,
    started: new Date().toISOString(),
    status: "copying",
    total: prepared.summary.uniqueFiles,
    done: 0,
    copied: 0,
    failed: 0,
    errors: [],
    sourceFilesModified: false,
  };
  let stream, lines;
  const record = async (data) => {
    await journal.write(
      JSON.stringify({ at: new Date().toISOString(), ...data }) + "\n",
    );
    await journal.sync();
  };
  try {
    await record({ event: "start", id: prepared.id });
    stream = fs.createReadStream(path.join(directory, "copy-plan.jsonl"));
    lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of lines) {
      if (signal.aborted) break;
      const row = JSON.parse(line);
      let created = false;
      try {
        if (
          !inside(path.join(directory, "Assets"), row.target) ||
          !/^[a-f0-9]{64}$/.test(row.expectedHash)
        )
          throw new Error("Invalid copy plan entry.");
        await rejectLinks(path.dirname(row.target));
        await unchanged(row);
        const before = await rowHash(row, signal);
        if (before !== row.expectedHash)
          throw new Error("Source hash changed since review. Source retained.");
        await fsp.mkdir(path.dirname(row.target), { recursive: true });
        await rejectLinks(path.dirname(row.target));
        await record({
          event: "intent",
          source: row.path,
          member: row.member,
          target: row.target,
        });
        if (row.member)
          await fsp.writeFile(row.target, await readRow(row), { flag: "wx" });
        else
          await fsp.copyFile(row.path, row.target, fs.constants.COPYFILE_EXCL);
        created = true;
        const target = await fsp.open(row.target, "r+");
        try {
          await target.sync();
        } finally {
          await target.close();
        }
        if ((await hashFile(row.target)) !== row.expectedHash)
          throw new Error("Copy hash verification failed. Source retained.");
        await unchanged(row);
        if ((await rowHash(row, signal)) !== row.expectedHash)
          throw new Error("Source changed during copying. Source retained.");
        await record({
          event: "verified",
          source: row.path,
          target: row.target,
          sha256: row.expectedHash,
        });
        receipt.copied++;
      } catch (e) {
        const error = {
          source: row.path,
          target: row.target,
          message: e.message,
          created,
        };
        receipt.failed++;
        if (receipt.errors.length < 30) receipt.errors.push(error);
        await record({ event: "failed", ...error });
      }
      receipt.done++;
      emit({
        phase: "assetCopy",
        running: true,
        done: receipt.done,
        total: receipt.total,
        errorCount: receipt.failed,
        errors: receipt.errors,
      });
    }
    receipt.status = signal.aborted
      ? "cancelled"
      : receipt.failed
        ? "incomplete"
        : "complete";
    receipt.finished = new Date().toISOString();
    await record({ event: "finished", ...receipt });
    await fsp.writeFile(
      path.join(directory, "copy-receipt.json"),
      JSON.stringify(receipt, null, 2),
      { flag: "wx" },
    );
    emit({
      phase: receipt.status,
      running: false,
      done: receipt.done,
      total: receipt.total,
      errorCount: receipt.failed,
      errors: receipt.errors,
    });
    return receipt;
  } finally {
    lines?.close();
    stream?.destroy();
    await journal.close();
  }
}
module.exports = { prepareLibrary, copyLibrary };
