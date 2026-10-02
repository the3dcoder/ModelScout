const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Catalog } = require("../app/catalog.cjs");
const collections = require("../app/collections.cjs");
const { scan } = require("../app/scanner.cjs");
const { planTransfer, executeTransfer, hashFile } = require("../app/files.cjs");
const { fixture, STL } = require("./helpers.cjs");
const scanRoot = (root, c) =>
  scan({ roots: [root] }, c, new AbortController().signal, () => {});

test("collections persist across rescans, filter saved searches, and follow verified moves", async () => {
  const root = await fixture("collections"),
    destination = await fixture("collections-dest");
  const c = new Catalog(":memory:");
  try {
    await fs.writeFile(path.join(root, "part.stl"), STL);
    await scanRoot(root, c);
    const row = c.query().rows[0];
    const id = collections.save(c, {
      name: "Desk organizer",
      creator: "Studio",
      license: "CC0",
      url: "https://example.org/model",
      notes: "Print all parts",
    });
    const other = collections.save(c, { name: "To print" });
    collections.members(c, id, [row.id]);
    collections.members(c, other, [row.id]);
    c.metadata([row.id], { tags: "practical", favorite: true });
    assert.equal(c.query({ collection: id }).count, 1);
    assert.equal(c.query({ collection: id, tags: ["unrelated"] }).count, 0);
    c.savedSearches("Projects", { collection: id });
    assert.equal(c.savedSearches()[0].query.collection, id);
    assert.throws(
      () => collections.save(c, { name: "DESK ORGANIZER" }),
      /already exists/,
    );
    assert.throws(
      () => collections.save(c, { name: "Bad", url: "file:///private" }),
      /https/,
    );
    assert.throws(
      () => collections.members(c, id, [row.id, "missing"]),
      /no longer/,
    );
    await scanRoot(root, c);
    assert.equal(collections.list(c)[0].members, 1);
    const plan = await planTransfer([c.get(row.id)], destination, "move");
    const result = await executeTransfer(
      plan,
      path.join(destination, "journal.jsonl"),
      () => {},
    );
    assert.equal(result.results[0].status, "moved");
    c.relocate(row.id, result.results[0].target);
    assert.equal(collections.list(c)[0].available, 0);
    await scanRoot(destination, c);
    const moved = c.query({ collection: id }).rows[0];
    assert.equal(moved.favorite, 1);
    assert.deepEqual(moved.tags, ["practical"]);
    collections.members(c, id, [moved.id], true);
    assert.equal(c.query({ collection: id }).count, 0);
    collections.remove(c, other);
    assert.equal(c.query().count, 1);
    assert.equal(await fs.readFile(moved.path, "utf8"), STL);
  } finally {
    c.close();
  }
});

test("rollback never exposes another file version's thumbnail or cached error", async () => {
  const root = await fixture("rollback-cache"),
    c = new Catalog(":memory:");
  try {
    await fs.writeFile(path.join(root, "part.stl"), STL);
    await scanRoot(root, c);
    const before = c.query().rows[0];
    c.saveThumbnail(before.id, before.version, Buffer.from("old"));
    c.beginScan();
    const changed = {
      ...before,
      size: before.size + 1,
      mtime: before.mtime + 1,
    };
    c.add(changed);
    c.flush();
    c.saveThumbnail(
      before.id,
      c.get(before.id).version,
      Buffer.from("new"),
      "new error",
    );
    c.finishScan(true);
    assert.equal(c.get(before.id).hasThumbnail, 0);
    assert.equal(c.get(before.id).thumbError, null);
    assert.equal(c.thumbnail(before.id), null);
    assert.equal(c.stats().thumbnails, 0);
    c.saveThumbnail(before.id, before.version, Buffer.from("restored"));
    assert.equal(Buffer.from(c.thumbnail(before.id)).toString(), "restored");
  } finally {
    c.close();
  }
});

async function project(name) {
  const root = await fixture(name),
    source = path.join(root, "source"),
    destination = path.join(root, "destination");
  await fs.mkdir(source);
  await fs.mkdir(destination);
  await fs.mkdir(path.join(source, "textures"));
  await fs.writeFile(
    path.join(source, "textures", "blue.png"),
    "texture fixture",
  );
  await fs.writeFile(
    path.join(source, "paint.mtl"),
    "newmtl paint\nKd 0 0 1\nmap_Kd -s 1 1 1 textures/blue.png\n",
  );
  const obj =
    "mtllib paint.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl paint\nf 1 2 3\n";
  await fs.writeFile(path.join(source, "part.obj"), obj);
  await fs.writeFile(path.join(source, "other.obj"), obj);
  const c = new Catalog(":memory:");
  await scanRoot(source, c);
  return { root, source, destination, c };
}
test("OBJ transfers copy shared materials/textures once before moving models", async () => {
  const { root, source, destination, c } = await project("obj-assets");
  try {
    const rows = c.query().rows,
      original = await hashFile(path.join(source, "paint.mtl"));
    const plan = await planTransfer(
      rows,
      destination,
      "move",
      "category",
      true,
    );
    assert.deepEqual(
      plan.entries.map((r) => r.error),
      ["", "", "", ""],
    );
    assert.equal(plan.entries.filter((r) => r.dependency).length, 2);
    const updates = [];
    const result = await executeTransfer(
      plan,
      path.join(root, "journal.jsonl"),
      (p) => updates.push(p),
    );
    assert.deepEqual(
      result.results.map((r) => r.status),
      ["copied", "copied", "moved", "moved"],
    );
    assert.ok(updates.every((p) => !p.results && p.latest));
    assert.equal(await hashFile(path.join(source, "paint.mtl")), original);
    for (const row of rows) await assert.rejects(fs.stat(row.path), /ENOENT/);
    for (const row of plan.entries)
      assert.ok((await fs.stat(row.target)).isFile());
  } finally {
    c.close();
  }
});
test("missing, stale, remote and escaped references block or retain the model", async () => {
  const { root, source, destination, c } = await project("blocked-assets");
  try {
    const row = c.query().rows[0];
    let plan = await planTransfer([row], destination, "move", "folders", true);
    await fs.writeFile(path.join(source, "paint.mtl"), "changed");
    const result = await executeTransfer(
      plan,
      path.join(root, "journal.jsonl"),
      () => {},
    );
    assert.equal(result.results.at(-1).status, "failed");
    assert.match(result.results.at(-1).message, /required asset/);
    assert.ok((await fs.stat(row.path)).isFile());
    for (const uri of [
      "../outside.bin",
      "https://example.org/asset.bin",
      "missing.bin",
      "%2e%2e/outside.bin",
      "C:/private.bin",
    ]) {
      await fs.writeFile(
        path.join(source, "bad.gltf"),
        JSON.stringify({ asset: { version: "2.0" }, buffers: [{ uri }] }),
      );
      await scanRoot(source, c);
      plan = await planTransfer(
        c.query({ ext: "gltf" }).rows,
        destination,
        "copy",
        "folders",
        true,
      );
      assert.ok(plan.entries.at(-1).error, uri);
    }
  } finally {
    c.close();
  }
});
test("glTF external buffers, encoded image names and embedded data stay intact", async () => {
  const root = await fixture("gltf-assets"),
    dest = await fixture("gltf-dest"),
    c = new Catalog(":memory:");
  try {
    await fs.writeFile(path.join(root, "mesh.bin"), Buffer.from([0, 1, 2]));
    await fs.writeFile(path.join(root, "blue paint.png"), "image");
    await fs.writeFile(
      path.join(root, "model.gltf"),
      JSON.stringify({
        asset: { version: "2.0" },
        buffers: [
          { uri: "mesh.bin" },
          { uri: "data:application/octet-stream;base64,AA==" },
        ],
        images: [{ uri: "blue%20paint.png" }],
      }),
    );
    await scanRoot(root, c);
    const plan = await planTransfer(
      c.query().rows,
      dest,
      "copy",
      "folders",
      true,
    );
    assert.equal(plan.entries.length, 3);
    const receipt = await executeTransfer(
      plan,
      path.join(dest, "journal.jsonl"),
      () => {},
    );
    assert.ok(receipt.results.every((r) => r.status === "copied"));
  } finally {
    c.close();
  }
});
