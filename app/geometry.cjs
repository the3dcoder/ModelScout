const { Worker } = require("node:worker_threads");
const path = require("node:path");
const { readRow, unchanged } = require("./files.cjs");
const ALGORITHM = "triangle-v1";
const LIMIT = 64 * 1024 * 1024;
function geometryTask(buffer, ext, signal) {
  if (buffer.byteLength > LIMIT)
    return Promise.reject(
      new Error("Geometry comparison read limit is 64 MiB."),
    );
  if (!["stl", "obj", "ply"].includes(ext))
    return Promise.reject(new Error("Supported formats: STL, OBJ, PLY."));
  if (signal?.aborted) return Promise.reject(new Error("Cancelled."));
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "geometry-worker.cjs"), {
      workerData: {
        buffer,
        ext,
        threeRoot: path
          .dirname(path.dirname(require.resolve("three")))
          .replace("app.asar", "app.asar.unpacked"),
      },
      resourceLimits: { maxOldGenerationSizeMb: 512 },
    });
    let settled = false;
    const finish = (error, data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      error ? reject(error) : resolve(data);
    };
    const abort = () => finish(new Error("Cancelled."));
    const timer = setTimeout(
      () => finish(new Error("Geometry comparison exceeded 45 seconds.")),
      45000,
    );
    signal?.addEventListener("abort", abort, { once: true });
    worker.once("message", (data) =>
      finish(data.error ? new Error(data.error) : null, data.result),
    );
    worker.once("error", (error) => finish(error));
    worker.once("exit", () => finish(new Error("Geometry worker stopped.")));
  });
}
async function compareGeometry(catalog, options, signal, emit) {
  const ids = options?.ids;
  if (ids && (!Array.isArray(ids) || ids.length > 10000))
    throw new Error("Choose up to 10,000 files for comparison.");
  const rows = ids
    ? [...new Set(ids)].map((id) => {
        const row = catalog.get(id);
        if (!row)
          throw new Error(
            "A selected file is unavailable. Rescan and select again.",
          );
        return row;
      })
    : catalog.queryGeometryRows();
  const supported = rows.filter((row) =>
    ["stl", "obj", "ply"].includes(row.ext),
  );
  const state = {
    phase: "geometry",
    running: true,
    total: supported.length,
    done: 0,
    cached: 0,
    analyzed: 0,
    errorCount: 0,
    errors: [],
    started: Date.now(),
  };
  let lastEmit = 0;
  emit({ ...state, errors: [] });
  for (const row of supported) {
    if (signal.aborted) break;
    try {
      await unchanged(row);
      const cached = catalog.db
        .prepare(
          "SELECT * FROM geometry_cache WHERE id=? AND version=? AND algorithm=?",
        )
        .get(row.id, row.version, ALGORITHM);
      if (cached && !(options?.retry && cached.error)) {
        state.cached++;
        if (cached.error) throw new Error(cached.error);
      } else {
        if (row.size > LIMIT)
          throw new Error("Geometry comparison read limit is 64 MiB.");
        const result = await geometryTask(await readRow(row), row.ext, signal);
        await unchanged(row);
        if (catalog.get(row.id)?.version !== row.version)
          throw new Error("File changed in the catalog. Rescan.");
        catalog.db
          .prepare(
            "INSERT OR REPLACE INTO geometry_cache VALUES(?,?,?,?,?,?,?,?,?)",
          )
          .run(
            row.id,
            row.version,
            ALGORITHM,
            row.size,
            row.mtime,
            row.ctime,
            result.signature,
            JSON.stringify(result),
            null,
          );
        state.analyzed++;
      }
    } catch (error) {
      if (signal.aborted) break;
      catalog.db
        .prepare(
          "INSERT OR REPLACE INTO geometry_cache VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .run(
          row.id,
          row.version,
          ALGORITHM,
          row.size,
          row.mtime,
          row.ctime,
          null,
          null,
          error.message.slice(0, 500),
        );
      state.errorCount++;
      if (state.errors.length < 200)
        state.errors.push({ path: row.path, message: error.message });
    }
    state.done++;
    if (Date.now() - lastEmit >= 250) {
      emit({ ...state, errors: state.errors.slice() });
      lastEmit = Date.now();
    }
  }
  state.running = false;
  state.phase = signal.aborted ? "cancelled" : "complete";
  catalog.setting("lastGeometryCheck", state);
  emit(state);
  return state;
}
const validJoin =
  " FROM files f JOIN geometry_cache g ON g.id=f.id AND g.size=f.size AND g.mtime=f.mtime AND g.ctime IS f.ctime AND g.algorithm='triangle-v1' ";
function validateSelection(catalog, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 10000)
    throw new Error("Choose 1–10,000 candidates for review.");
  const selected = [...new Set(ids)],
    signatures = new Map();
  const lookup = catalog.db.prepare(
    "SELECT g.signature" +
      validJoin +
      "WHERE f.id=? AND g.signature IS NOT NULL",
  );
  const count = catalog.db.prepare(
    "SELECT COUNT(*) AS count" + validJoin + "WHERE g.signature=?",
  );
  for (const id of selected) {
    const result = lookup.get(id);
    if (!result)
      throw new Error(
        "A candidate changed or is unavailable. Rescan and compare again.",
      );
    signatures.set(
      result.signature,
      (signatures.get(result.signature) || 0) + 1,
    );
  }
  for (const [signature, picked] of signatures) {
    if (count.get(signature).count <= picked)
      throw new Error(
        "Keep at least one file in every matching geometry group before queuing extras.",
      );
  }
  return selected;
}
function groups(catalog, page = 0) {
  const grouped =
    "SELECT g.signature,COUNT(*) AS count" +
    validJoin +
    "WHERE g.signature IS NOT NULL GROUP BY g.signature HAVING COUNT(*)>1";
  const total = catalog.db
    .prepare("SELECT COUNT(*) AS count FROM (" + grouped + ")")
    .get().count;
  page = Math.min(
    Math.max(0, Math.floor(Number(page) || 0)),
    Math.max(0, Math.ceil(total / 20) - 1),
  );
  const result = catalog.db
    .prepare(grouped + " ORDER BY count DESC,g.signature LIMIT 20 OFFSET ?")
    .all(page * 20);
  return {
    total,
    page,
    groups: result.map((group) => ({
      ...group,
      files: catalog.db
        .prepare(
          "SELECT f.id,g.details" +
            validJoin +
            "WHERE g.signature=? ORDER BY f.name,f.id LIMIT 80",
        )
        .all(group.signature)
        .map((item) => ({
          ...catalog.get(item.id),
          geometry: JSON.parse(item.details),
        })),
      truncated: group.count > 80,
    })),
  };
}
module.exports = {
  geometryTask,
  compareGeometry,
  groups,
  validateSelection,
  ALGORITHM,
};
