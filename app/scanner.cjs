const fs = require("node:fs/promises");
const path = require("node:path");
const { EXTENSIONS, EXTRA_EXTENSIONS, fileRecord } = require("./formats.cjs");
const { listArchive } = require("./archive.cjs");
async function scan(
  { roots, archives = false, extras = false },
  catalog,
  signal,
  onProgress,
) {
  const extensions = new Set([
    ...EXTENSIONS,
    ...(extras ? EXTRA_EXTENSIONS : []),
  ]);
  const unique = [];
  for (const item of roots) {
    const root = await fs.realpath(item);
    const s = await fs.stat(root);
    if (!s.isDirectory()) throw new Error(`Not a directory: ${root}`);
    if (!unique.some((p) => p.toLowerCase() === root.toLowerCase()))
      unique.push(root);
  }
  const scope = unique.filter(
    (p) =>
      !unique.some(
        (q) =>
          q !== p &&
          p
            .toLowerCase()
            .startsWith(q.toLowerCase().replace(/[\\/]+$/, "") + path.sep),
      ),
  );
  if (!scope.length) throw new Error("Choose at least one folder or drive.");
  catalog.beginScan();
  const state = {
    phase: "files",
    directories: 0,
    files: 0,
    matches: 0,
    archiveCount: 0,
    archivesRead: 0,
    skippedLinks: 0,
    errors: [],
    errorCount: 0,
    roots: scope,
    started: Date.now(),
    running: true,
  };
  catalog.setting("lastScan", state);
  for (const root of scope) catalog.addLocation(root, "folder", root);
  const queue = scope.map((root) => ({ dir: root, root }));
  const packs = [];
  let last = 0;
  const emit = (force = false) => {
    if (force || Date.now() - last > 180) {
      last = Date.now();
      onProgress({ ...state, errors: state.errors.slice() });
    }
  };
  const error = (p, e) => {
    state.errorCount++;
    if (state.errors.length < 200)
      state.errors.push({ path: p, message: e.message });
  };
  const visit = async ({ dir, root }) => {
    try {
      const handle = await fs.opendir(dir);
      state.directories++;
      for await (const entry of handle) {
        if (signal.aborted) break;
        const file = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) {
          state.skippedLinks++;
          continue;
        }
        if (entry.isDirectory()) {
          catalog.addLocation(file, "folder", root);
          queue.push({ dir: file, root });
          continue;
        }
        if (!entry.isFile()) continue;
        state.files++;
        const ext = path.extname(entry.name).slice(1).toLowerCase();
        if (extensions.has(ext)) {
          try {
            catalog.add(fileRecord(file, await fs.stat(file), root));
            state.matches++;
          } catch (e) {
            error(file, e);
          }
        } else if (["zip", "7z", "rar"].includes(ext)) {
          catalog.addLocation(file, "archive", root);
          if (archives) packs.push({ file, root });
        }
        emit();
      }
    } catch (e) {
      error(dir, e);
    }
  };
  emit(true);
  while (queue.length && !signal.aborted) {
    await Promise.all(queue.splice(0, 8).map(visit));
    await new Promise((resolve) => setImmediate(resolve));
  }
  state.archiveCount = packs.length;
  if (archives && !signal.aborted) {
    state.phase = "archives";
    emit(true);
    for (const { file, root } of packs) {
      if (signal.aborted) break;
      try {
        const stat = await fs.stat(file);
        await listArchive(
          file,
          async (entry) => {
            if (
              extensions.has(path.extname(entry.name).slice(1).toLowerCase())
            ) {
              catalog.add(
                fileRecord(
                  file,
                  {
                    size: entry.size,
                    mtimeMs: stat.mtimeMs,
                    ctimeMs: stat.ctimeMs,
                  },
                  root,
                  entry.name,
                ),
              );
              state.matches++;
              emit();
            }
          },
          signal,
        );
      } catch (e) {
        if (!signal.aborted) error(file, e);
      }
      state.archivesRead++;
      emit();
    }
  }
  catalog.finishScan(signal.aborted);
  state.phase = signal.aborted ? "cancelled" : "complete";
  state.running = false;
  state.restoredPrevious = signal.aborted;
  state.finished = Date.now();
  emit(true);
  catalog.setting("lastScan", state);
  return state;
}
module.exports = { scan };
