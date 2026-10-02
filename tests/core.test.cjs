const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Catalog } = require("../app/catalog.cjs");
const { scan } = require("../app/scanner.cjs");
const { EXTENSIONS, fileRecord } = require("../app/formats.cjs");
const {
  readRow,
  duplicates,
  planTransfer,
  executeTransfer,
} = require("../app/files.cjs");
const {
  safeMember,
  listArchive,
  readMember,
  SEVEN,
} = require("../app/archive.cjs");
const { fixture, zip, STL } = require("./helpers.cjs");
async function add(catalog, file, root) {
  return catalog.add(fileRecord(file, await fs.stat(file), root));
}
test("discovery covers every requested extension, uppercase, overlapping roots and opt-in archives", async () => {
  const root = await fixture("scan");
  const child = path.join(root, "models");
  await fs.mkdir(child);
  for (const ext of EXTENSIONS)
    await fs.writeFile(
      path.join(child, "file." + ext.toUpperCase()),
      "example",
    );
  await fs.writeFile(path.join(root, "ignore.txt"), "ignore");
  await fs.writeFile(
    path.join(root, "pack.zip"),
    zip({ "inside/model.stl": STL }),
  );
  const c = new Catalog(":memory:");
  const state = await scan(
    { roots: [root, child] },
    c,
    new AbortController().signal,
    () => {},
  );
  assert.equal(state.matches, 24);
  assert.equal(c.stats().total, 24);
  assert.equal(state.files, 26);
  assert.equal(c.stats().archived, 0);
  await scan(
    { roots: [root], archives: true },
    c,
    new AbortController().signal,
    () => {},
  );
  assert.equal(c.stats().total, 25);
  assert.equal(c.stats().archived, 1);
  const r = c.query({ kind: "archive" }).rows[0];
  assert.equal((await readRow(r)).toString(), STL);
  c.close();
});
test("duplicate detection compares contents, not names, and rejects stale sources", async () => {
  const root = await fixture("duplicates");
  const c = new Catalog(":memory:");
  for (const [name, content] of [
    ["same.stl", "AA"],
    ["renamed.obj", "AA"],
    ["variant.stl", "AB"],
    ["changed.stl", "AA"],
  ]) {
    const p = path.join(root, name);
    await fs.writeFile(p, content);
    await add(c, p, root);
  }
  c.flush();
  await fs.writeFile(path.join(root, "changed.stl"), "different");
  let state;
  await duplicates(c, new AbortController().signal, (s) => (state = s));
  assert.equal(c.stats().duplicateGroups, 1);
  assert.equal(c.query({ kind: "duplicates" }).count, 2);
  assert.equal(state.errorCount, 1);
  c.close();
});
test("copy preserves source, refuses existing destination, records verification, and move removes only verified source", async () => {
  const root = await fixture("transfer"),
    source = path.join(root, "source"),
    dest = path.join(root, "dest");
  await fs.mkdir(source);
  await fs.mkdir(dest);
  const p = path.join(source, "one.stl");
  await fs.writeFile(p, STL);
  const row = { ...fileRecord(p, await fs.stat(p), source), id: "one" };
  const plan = await planTransfer([row], dest, "copy");
  assert.equal(plan.entries[0].error, "");
  const result = await executeTransfer(
    plan,
    path.join(root, "copy.jsonl"),
    () => {},
  );
  assert.equal(result.results[0].status, "copied");
  assert.equal(await fs.readFile(p, "utf8"), STL);
  assert.equal(await fs.readFile(plan.entries[0].target, "utf8"), STL);
  assert.match(
    await fs.readFile(result.journalPath, "utf8"),
    /"event":"verified"/,
  );
  const collision = await planTransfer([row], dest);
  assert.match(collision.entries[0].error, /already exists/);
  await assert.rejects(() =>
    executeTransfer(collision, path.join(root, "collision.jsonl"), () => {}),
  );
  const dest2 = path.join(root, "move");
  await fs.mkdir(dest2);
  const moving = await planTransfer([row], dest2, "move");
  const moved = await executeTransfer(
    moving,
    path.join(root, "move.jsonl"),
    () => {},
  );
  assert.equal(moved.results[0].status, "moved");
  await assert.rejects(fs.stat(p), { code: "ENOENT" });
  assert.equal(await fs.readFile(moving.entries[0].target, "utf8"), STL);
});
test("changed source after review cannot be moved; destination race never overwrites", async () => {
  const root = await fixture("race"),
    dest = path.join(root, "dest");
  await fs.mkdir(dest);
  const p = path.join(root, "model.stl");
  await fs.writeFile(p, "original");
  let row = { ...fileRecord(p, await fs.stat(p), root), id: "one" };
  let plan = await planTransfer([row], dest, "move");
  await fs.writeFile(p, "changed length");
  let result = await executeTransfer(
    plan,
    path.join(root, "stale.jsonl"),
    () => {},
  );
  assert.equal(result.results[0].status, "failed");
  assert.equal(await fs.readFile(p, "utf8"), "changed length");
  row = { ...fileRecord(p, await fs.stat(p), root), id: "one" };
  plan = await planTransfer([row], dest);
  await fs.mkdir(path.dirname(plan.entries[0].target), { recursive: true });
  await fs.writeFile(plan.entries[0].target, "unrelated");
  result = await executeTransfer(plan, path.join(root, "race.jsonl"), () => {});
  assert.equal(result.results[0].status, "failed");
  assert.equal(await fs.readFile(plan.entries[0].target, "utf8"), "unrelated");
});
test("archive copying preserves archive; archive moves are blocked and project dependencies are disclosed", async () => {
  const root = await fixture("archive"),
    dest = path.join(root, "dest");
  await fs.mkdir(dest);
  const p = path.join(root, "models.zip");
  await fs.writeFile(p, zip({ "safe/model.stl": STL }));
  const stat = await fs.stat(p);
  const row = {
    ...fileRecord(
      p,
      { size: Buffer.byteLength(STL), mtimeMs: stat.mtimeMs },
      root,
      "safe/model.stl",
    ),
    id: "one",
  };
  assert.match(
    (await planTransfer([row], dest, "move")).entries[0].error,
    /Archive/,
  );
  const plan = await planTransfer([row], dest);
  await executeTransfer(plan, path.join(root, "archive.jsonl"), () => {});
  assert.equal(await fs.readFile(plan.entries[0].target, "utf8"), STL);
  assert.ok(await fs.stat(p));
  assert.equal(safeMember("../evil.stl"), false);
  assert.equal(safeMember("C:\\evil.stl"), false);
  assert.equal(safeMember("x/../../evil.stl"), false);
  assert.equal(safeMember("normal/file.stl:hidden"), false);
  assert.equal(safeMember("normal/CON.stl"), false);
  assert.equal(safeMember("normal/valid.stl"), true);
  const obj = path.join(root, "model.obj");
  await fs.writeFile(obj, "v 0 0 0");
  assert.match(
    (
      await planTransfer(
        [{ ...fileRecord(obj, await fs.stat(obj), root), id: "obj" }],
        dest,
        "move",
      )
    ).entries[0].warning,
    /project references/,
  );
});
test(
  "7z and RAR listing path uses installed 7-Zip, with exact member extraction",
  { skip: !SEVEN },
  async () => {
    const { execFileSync } = require("node:child_process");
    const root = await fixture("7zip"),
      p = path.join(root, "model.stl");
    await fs.writeFile(p, STL);
    const archive = path.join(root, "models.7z");
    execFileSync(SEVEN, ["a", archive, p], {
      windowsHide: true,
      stdio: "ignore",
    });
    const entries = [];
    await listArchive(archive, (e) => entries.push(e));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, "model.stl");
    assert.equal((await readMember(archive, "model.stl")).toString(), STL);
  },
);
test("query escapes wildcard input and keeps reviewed categories across scans", async () => {
  const root = await fixture("query");
  const p = path.join(root, "100%_part.stl");
  await fs.writeFile(p, STL);
  const c = new Catalog(":memory:");
  await scan({ roots: [root] }, c, new AbortController().signal, () => {});
  const id = c.query().rows[0].id;
  c.annotate(id, "Reviewed", "my notes");
  assert.equal(c.query({ search: "%_" }).count, 1);
  assert.equal(c.query({ search: "missing%" }).count, 0);
  assert.equal(c.query({ category: "Reviewed" }).count, 1);
  await scan({ roots: [root] }, c, new AbortController().signal, () => {});
  assert.equal(c.get(id).reviewedCategory, "Reviewed");
  c.close();
});
test("destination junction is rejected and cancelled scan is marked", async () => {
  const root = await fixture("links");
  const target = path.join(root, "target"),
    link = path.join(root, "link");
  await fs.mkdir(target);
  await fs.symlink(target, link, "junction");
  const p = path.join(root, "one.stl");
  await fs.writeFile(p, STL);
  const row = { ...fileRecord(p, await fs.stat(p), root), id: "one" };
  await assert.rejects(() => planTransfer([row], link), /contains a link/);
  const c = new Catalog(":memory:");
  const ac = new AbortController();
  const s = await scan({ roots: [root] }, c, ac.signal, (state) => {
    if (state.phase === "files") ac.abort();
  });
  assert.equal(s.phase, "cancelled");
  assert.equal(s.running, false);
  c.close();
});
test("content inspection reads G-code metadata and detects binary OBJ without executing it", async () => {
  const { inspect } = require("../app/inspect.cjs");
  const root = await fixture("inspect");
  const p = path.join(root, "model.gcode");
  await fs.writeFile(
    p,
    "; generated by TestSlicer\n; filament used = 1m\nG1 X10 Y20\n",
  );
  const found = await inspect(fileRecord(p, await fs.stat(p), root));
  assert.ok(found.facts.some((x) => x.includes("Machine instruction")));
  assert.ok(found.facts.some((x) => x.includes("TestSlicer")));
  const obj = path.join(root, "compiled.obj");
  await fs.writeFile(obj, Buffer.from([0, 1, 0, 0]));
  assert.match(
    (await inspect(fileRecord(obj, await fs.stat(obj), root))).facts[0],
    /compiled object/,
  );
});
