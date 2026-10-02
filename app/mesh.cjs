const { Worker } = require("node:worker_threads");
const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const { readRow, rejectLinks } = require("./files.cjs");
const { fileRecord } = require("./formats.cjs");
const hash = (buffer) =>
  crypto.createHash("sha256").update(buffer).digest("hex");
function meshTask(buffer, options) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "mesh-worker.cjs"), {
      workerData: {
        buffer,
        options,
        threeRoot: path
          .dirname(path.dirname(require.resolve("three")))
          .replace(
            `${path.sep}app.asar${path.sep}`,
            `${path.sep}app.asar.unpacked${path.sep}`,
          ),
      },
      resourceLimits: { maxOldGenerationSizeMb: 512 },
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(
        new Error(
          "Mesh analysis exceeded 45 seconds. Use your mesh editor for this file.",
        ),
      );
    }, 45000);
    worker.once("message", (data) => {
      clearTimeout(timer);
      worker.terminate();
      data.error ? reject(new Error(data.error)) : resolve(data.result);
    });
    worker.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    worker.once("exit", (code) => {
      clearTimeout(timer);
      if (code) reject(new Error("Mesh analysis worker stopped."));
    });
  });
}
function optionsOf(input) {
  const scale = Number(input?.scale),
    rotation = input?.rotation?.map(Number);
  if (
    !Number.isFinite(scale) ||
    scale < 0.1 ||
    scale > 10000 ||
    !Array.isArray(rotation) ||
    rotation.length !== 3 ||
    rotation.some((n) => !Number.isFinite(n) || Math.abs(n) > 360)
  )
    throw new Error(
      "Use scale 0.1–10,000% and rotations between −360° and 360°.",
    );
  return {
    scale,
    rotation,
    removeDegenerate: input.removeDegenerate === true,
    removeDuplicates: input.removeDuplicates === true,
  };
}
async function exportEdited(plan, destination, logDirectory) {
  if (
    path.resolve(destination).toLowerCase() ===
    path.resolve(plan.source.path).toLowerCase()
  )
    throw new Error("Choose a new file; the original is preserved.");
  if (path.extname(destination).toLowerCase() !== ".stl")
    throw new Error("Save the edited copy with an .stl extension.");
  await rejectLinks(path.dirname(destination));
  if (hash(await readRow(plan.source)) !== plan.sourceHash)
    throw new Error(
      "Source changed after review. Prepare the edited copy again.",
    );
  const buffer = Buffer.from(plan.buffer);
  const handle = await fs.open(destination, "wx");
  try {
    await handle.writeFile(buffer);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const outputHash = hash(await fs.readFile(destination));
  if (outputHash !== hash(buffer))
    throw new Error(
      "Output verification failed; inspect the saved copy before using it. Original preserved.",
    );
  const receipt = {
    date: new Date().toISOString(),
    source: plan.source.path,
    member: plan.source.member,
    sourceHash: plan.sourceHash,
    destination,
    outputHash,
    options: plan.options,
    before: plan.before,
    after: plan.after,
  };
  await fs.mkdir(logDirectory, { recursive: true });
  const log = path.join(logDirectory, `edit-${plan.id}.json`);
  await fs.writeFile(log, JSON.stringify(receipt, null, 2), { flag: "wx" });
  return { path: destination, log, outputHash };
}
function registerMesh({
  handle,
  catalog,
  win,
  row,
  requireIdle,
  userData,
  dialog,
}) {
  let plan = null,
    busy = false;
  const prepare = async (id, input) => {
    requireIdle();
    if (busy) throw new Error("Wait for mesh analysis to finish.");
    busy = true;
    try {
      plan = null;
      const r = row(id);
      if (r.ext !== "stl")
        throw new Error(
          "Basic repair and edit tools currently support STL files.",
        );
      if (r.size > 64 * 1024 * 1024)
        throw new Error("Basic mesh tools support STL files up to 64 MiB.");
      const buffer = await readRow(r);
      const options = input ? optionsOf(input) : null;
      const result = await meshTask(buffer, options);
      if (catalog.get(id)?.version !== r.version)
        throw new Error("Catalog changed. Select the file again.");
      catalog.analysis(id, { meshReport: result.before }, r.version);
      if (!options) return result;
      plan = {
        ...result,
        id: crypto.randomUUID(),
        source: r,
        sourceHash: hash(buffer),
        options,
      };
      return { before: plan.before, after: plan.after, id: plan.id, options };
    } finally {
      busy = false;
    }
  };
  handle("meshAnalyze", (id) => prepare(id, null));
  handle("meshPrepare", prepare);
  handle("readEdit", (id) => {
    if (!plan || plan.id !== id) throw new Error("Edited preview expired.");
    return { buffer: plan.buffer, ext: "stl" };
  });
  handle("meshExport", async (id) => {
    requireIdle();
    if (busy || !plan || plan.id !== id)
      throw new Error("Review the edited preview again.");
    busy = true;
    try {
      const current = plan;
      const result = await dialog.showSaveDialog(win, {
        title: "Save a new edited STL copy",
        defaultPath: path.basename(current.source.name, ".stl") + "-edited.stl",
        filters: [{ name: "STL", extensions: ["stl"] }],
      });
      if (result.canceled) return null;
      const receipt = await exportEdited(current, result.filePath, userData);
      const id = catalog.add(
        fileRecord(
          receipt.path,
          await fs.stat(receipt.path),
          path.dirname(receipt.path),
        ),
      );
      catalog.flush();
      catalog.analysis(id, {
        meshReport: current.after,
        derivedFrom: current.source.id,
      });
      plan = null;
      return { ...receipt, id };
    } finally {
      busy = false;
    }
  });
}
module.exports = { meshTask, optionsOf, exportEdited, registerMesh };
