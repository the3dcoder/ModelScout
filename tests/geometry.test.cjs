const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Catalog } = require("../app/catalog.cjs");
const { scan } = require("../app/scanner.cjs");
const {
  geometryTask,
  compareGeometry,
  groups,
  validateSelection,
} = require("../app/geometry.cjs");
const { fixture, STL } = require("./helpers.cjs");
const scanRoot = (root, c) =>
  scan({ roots: [root] }, c, new AbortController().signal, () => {});
const OBJ =
  "v 0 0 0\nv 0 20 0\nv 20 0 0\nv 0 0 20\nf 1 2 3\nf 1 3 4\nf 1 4 2\nf 3 2 4\n";
const PLY =
  "ply\nformat ascii 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nelement face 4\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n0 20 0\n20 0 0\n0 0 20\n3 0 1 2\n3 0 2 3\n3 0 3 1\n3 2 1 3\n";
test("canonical geometry matches STL/OBJ/PLY, vertex order, winding and translation; preserves scale and shape", async () => {
  const stl = await geometryTask(Buffer.from(STL), "stl");
  const obj = await geometryTask(Buffer.from(OBJ), "obj");
  const ply = await geometryTask(Buffer.from(PLY), "ply");
  assert.equal(stl.signature, obj.signature);
  assert.equal(stl.signature, ply.signature);
  const moved = OBJ.replace(
    /^v (.+)$/gm,
    (_, line) =>
      "v " +
      line
        .split(" ")
        .map((n) => Number(n) + 12)
        .join(" "),
  ).replace("f 1 2 3", "f 3 2 1");
  assert.equal(
    (await geometryTask(Buffer.from(moved), "obj")).signature,
    stl.signature,
  );
  assert.notEqual(
    (await geometryTask(Buffer.from(OBJ.replaceAll("20", "40")), "obj"))
      .signature,
    stl.signature,
  );
  assert.notEqual(
    (
      await geometryTask(
        Buffer.from(OBJ.replace("v 0 0 20", "v 0 1 20")),
        "obj",
      )
    ).signature,
    stl.signature,
  );
  await assert.rejects(
    geometryTask(Buffer.from("v 0 0 0\nv 1 0 0\nl 1 2\n"), "obj"),
    /Non-triangle/,
  );
  await assert.rejects(
    geometryTask(Buffer.from("invalid"), "stl"),
    /Could not parse STL triangle geometry/,
  );
  await assert.rejects(
    geometryTask(Buffer.alloc(64 * 1024 * 1024 + 1), "stl"),
    /64 MiB/,
  );
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    geometryTask(Buffer.from(STL), "stl", abort.signal),
    /Cancelled/,
  );
  const active = new AbortController();
  const working = geometryTask(
    Buffer.from(OBJ + "f 1 2 3\n".repeat(400000)),
    "obj",
    active.signal,
  );
  const timer = setTimeout(() => active.abort(), 30);
  try {
    await assert.rejects(working, /Cancelled/);
  } finally {
    clearTimeout(timer);
  }
});
test("cached comparison resumes after cancellation, ignores changed versions and keeps metadata on moves", async () => {
  const root = await fixture("geometry-cache"),
    c = new Catalog(":memory:");
  try {
    await fs.writeFile(path.join(root, "part.stl"), STL);
    await fs.writeFile(path.join(root, "part.obj"), OBJ);
    await fs.writeFile(path.join(root, "part.ply"), PLY);
    await fs.writeFile(path.join(root, "broken.stl"), "bad");
    await scanRoot(root, c);
    await assert.rejects(
      compareGeometry(
        c,
        { ids: ["missing"] },
        new AbortController().signal,
        () => {},
      ),
      /unavailable/,
    );
    const abort = new AbortController();
    let state = await compareGeometry(c, {}, abort.signal, (s) => {
      if (s.done >= 1) abort.abort();
    });
    assert.equal(state.phase, "cancelled");
    assert.ok(state.done >= 1);
    state = await compareGeometry(
      c,
      {},
      new AbortController().signal,
      () => {},
    );
    assert.ok(state.cached >= 1);
    assert.equal(state.errorCount, 1);
    assert.equal(groups(c).groups[0].count, 3);
    const groupIds = groups(c).groups[0].files.map((f) => f.id);
    assert.deepEqual(validateSelection(c, [groupIds[0]]), [groupIds[0]]);
    assert.throws(() => validateSelection(c, groupIds), /Keep at least one/);
    assert.throws(() => validateSelection(c, ["unknown"]), /changed/);
    state = await compareGeometry(
      c,
      {},
      new AbortController().signal,
      () => {},
    );
    assert.equal(state.cached, 4);
    assert.equal(state.analyzed, 0);
    const row = c.query({ ext: "obj" }).rows[0];
    await fs.writeFile(row.path, OBJ.replaceAll("20", "30"));
    await scanRoot(root, c);
    assert.equal(groups(c).groups[0].count, 2);
    await compareGeometry(
      c,
      { ids: [row.id] },
      new AbortController().signal,
      () => {},
    );
    assert.equal(groups(c).groups[0].count, 2);
    c.setting("cost:" + row.id, {
      result: { total: 12 },
      fileVersion: row.version,
    });
    const destination = path.join(root, "moved.obj");
    c.relocate(row.id, destination);
    await fs.copyFile(row.path, destination);
    await scanRoot(root, c);
    const moved = c.query({ search: "moved.obj" }).rows[0];
    assert.equal(c.setting("cost:" + moved.id).result.total, 12);
  } finally {
    c.close();
  }
});
