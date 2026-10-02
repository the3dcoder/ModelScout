const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { Catalog } = require("../app/catalog.cjs");
const { scan } = require("../app/scanner.cjs");
const { duplicates, hashFile } = require("../app/files.cjs");
const { fileRecord } = require("../app/formats.cjs");
const { meshTask, optionsOf, exportEdited } = require("../app/mesh.cjs");
const { fixture, STL } = require("./helpers.cjs");
const signal = () => new AbortController().signal;
const runScan = (root, c) => scan({ roots: [root] }, c, signal(), () => {});
test("cache survives unchanged rescan; changed data invalidates hashes, analysis and thumbnails", async () => {
  const root = await fixture("cache");
  for (const n of ["a", "b"])
    await fs.writeFile(path.join(root, n + ".stl"), STL);
  const c = new Catalog(":memory:");
  try {
    await runScan(root, c);
    let r = c.query().rows[0];
    c.annotate(r.id, "Custom", "Keep notes");
    c.metadata([r.id], { tags: "DND, terrain, dnd", favorite: true });
    c.analysis(r.id, { meshes: 1 }, r.version);
    c.saveThumbnail(r.id, r.version, Buffer.from("thumbnail"));
    let d = await duplicates(c, signal(), () => {});
    assert.equal(d.hashed, 2);
    assert.equal(d.cached, 0);
    await runScan(root, c);
    r = c.get(r.id);
    assert.equal(r.hasThumbnail, 1);
    assert.deepEqual(r.tags, ["dnd", "terrain"]);
    assert.equal(r.reviewedCategory, "Custom");
    assert.equal(JSON.parse(r.analysis).meshes, 1);
    d = await duplicates(c, signal(), () => {});
    assert.equal(d.hashed, 0);
    assert.equal(d.cached, 2);
    assert.equal(c.stats().duplicateGroups, 1);
    const version = r.version;
    await fs.writeFile(r.path, STL.replaceAll("20", "30"));
    await runScan(root, c);
    r = c.get(r.id);
    assert.equal(r.hash, null);
    assert.equal(r.analysis, null);
    assert.equal(r.hasThumbnail, 0);
    assert.equal(r.favorite, 1);
    assert.equal(c.analysis(r.id, { stale: true }, version), false);
  } finally {
    c.close();
  }
});
test("tag filters combine all/any/exclusion; bulk edits preserve category; saved queries and pagination are bounded", async () => {
  const root = await fixture("tags"),
    c = new Catalog(":memory:");
  try {
    for (const n of ["alpha", "beta", "gamma"])
      await fs.writeFile(path.join(root, n + ".stl"), STL);
    await runScan(root, c);
    const [a, b, d] = c.query().rows;
    c.annotate(a.id, "Reviewed", "note");
    c.metadata([a.id, b.id], { tags: ["red", "small"], mode: "add" });
    c.metadata([d.id], { tags: "blue" });
    c.metadata([b.id], { tags: "small", mode: "remove", favorite: true });
    c.metadata([a.id], { tags: "red", mode: "replace" });
    assert.equal(c.get(a.id).notes, "note");
    assert.equal(c.get(a.id).reviewedCategory, "Reviewed");
    assert.equal(c.query({ tags: ["red", "small"] }).count, 0);
    assert.equal(c.query({ tags: ["red", "blue"], tagMode: "any" }).count, 3);
    assert.equal(c.query({ excludeTags: ["red"] }).count, 1);
    assert.equal(c.query({ kind: "favorites" }).count, 1);
    assert.equal(c.query({ search: "alpha red" }).count, 1);
    assert.equal(c.ids({ tags: ["red"] }).length, 2);
    assert.equal(c.query({ page: 999, pageSize: 24 }).page, 0);
    c.savedSearches("Reds", { tags: ["red"], page: 900 });
    assert.deepEqual(c.savedSearches()[0].query.tags, ["red"]);
    assert.equal(c.savedSearches()[0].query.page, undefined);
    assert.throws(() => c.metadata([a.id, "absent"], { tags: "partial" }));
    assert.deepEqual(c.get(a.id).tags, ["red"]);
  } finally {
    c.close();
  }
});
test("cancelled and interrupted scans restore the prior complete inventory", async () => {
  const root = await fixture("rollback"),
    db = path.join(root, "test.sqlite");
  await fs.writeFile(path.join(root, "original.stl"), STL);
  let c = new Catalog(db);
  await runScan(root, c);
  const original = c.query().rows[0];
  const abort = new AbortController();
  abort.abort();
  await scan({ roots: [root] }, c, abort.signal, () => {});
  assert.equal(c.stats().total, 1);
  assert.equal(c.get(original.id).name, "original.stl");
  c.beginScan();
  c.close();
  c = new Catalog(db);
  assert.equal(c.stats().total, 1);
  c.close();
});
test("v1 catalog migration makes a backup and retains category, notes and analysis", async () => {
  const root = await fixture("migration"),
    file = path.join(root, "catalog.sqlite");
  const old = new DatabaseSync(file);
  old.exec(
    "CREATE TABLE files(id TEXT PRIMARY KEY,path TEXT,member TEXT,root TEXT,name TEXT,ext TEXT,size REAL,mtime REAL,family TEXT,category TEXT,evidence TEXT,confidence TEXT,preview INTEGER,hash TEXT,analysis TEXT); CREATE TABLE notes(id TEXT PRIMARY KEY,category TEXT,notes TEXT); INSERT INTO files VALUES('test','C:\\test.stl','','C:\\','test.stl','stl',10,123,'Mesh','Guessed','','Low',1,'hash','{\"meshes\":1}'); INSERT INTO notes VALUES('test','Mine','Keep');",
  );
  old.close();
  const c = new Catalog(file);
  try {
    assert.ok((await fs.stat(c.backupPath)).size > 0);
    assert.equal(c.get("test").reviewedCategory, "Mine");
    assert.equal(c.get("test").notes, "Keep");
    assert.equal(JSON.parse(c.get("test").analysis).meshes, 1);
    c.metadata(["test"], { tags: "reviewed" });
    c.annotate("test", "New", "Still here");
    assert.deepEqual(c.get("test").tags, ["reviewed"]);
  } finally {
    c.close();
  }
});
test("FDM and resin cost formulas account for units, yield, margin and successful-part finishing", async () => {
  const { profileDefaults, estimateCost, importProfile, parseGcodeEstimates } =
    await import("../src/costing.mjs");
  const p = {
    ...profileDefaults,
    packPrice: 20,
    watts: 100,
    electricity: 0.2,
    printerPrice: 1000,
    lifetimeHours: 1000,
    maintenanceHourly: 0.5,
    laborHourly: 30,
    setupMinutes: 10,
    finishMinutesPerPart: 2,
    consumablesPerJob: 1,
    packagingPerPart: 0.5,
    failurePercent: 20,
    marginPercent: 25,
  };
  const e = estimateCost(p, { hours: 2, amount: 100, parts: 2 });
  // Attempt: 2 material + .04 electricity + 2 depreciation + 1 maintenance + 5 setup + 1 consumables = 11.04. At 80% yield: 13.8, plus 2 finishing + 1 packaging.
  assert.ok(Math.abs(e.total - 16.8) < 1e-9);
  assert.ok(Math.abs(e.price - 22.4) < 1e-9);
  assert.ok(Math.abs(e.perPart - 8.4) < 1e-9);
  const resin = estimateCost(
    {
      ...profileDefaults,
      technology: "resin",
      materialUnit: "ml",
      packAmount: 500,
      packPrice: 30,
      washCureMinutes: 30,
      washCureWatts: 100,
      electricity: 0.2,
      washCureCost: 0.5,
    },
    { hours: 1, amount: 50, parts: 1 },
  );
  assert.equal(resin.total, 3.51);
  assert.throws(() =>
    estimateCost(
      { ...p, failurePercent: 100 },
      { hours: 1, amount: 1, parts: 1 },
    ),
  );
  assert.throws(() => estimateCost(p, { hours: "", amount: 1, parts: 1 }));
  assert.throws(() => importProfile({ version: 2, profile: p }));
  assert.deepEqual(
    importProfile({
      format: "model-scout-cost-profile",
      version: 1,
      profile: p,
    }),
    p,
  );
  const parsed = parseGcodeEstimates(
    "; estimated printing time (normal mode) = 1d 2h 3m 4s\n; filament used [g] = 12, 8\n; filament used [cm3] = 16",
  );
  assert.equal(parsed.grams, 20);
  assert.equal(parsed.hours, (86400 + 7200 + 180 + 4) / 3600);
  assert.equal(parsed.milliliters, 16);
  assert.equal(parseGcodeEstimates(";TIME:7200").hours, 2);
  assert.equal(parseGcodeEstimates(";Filament used: 5m").grams, null);
});
test("STL checks and edits produce a verified new copy; source and existing destinations are preserved", async () => {
  const root = await fixture("mesh"),
    source = path.join(root, "source.stl");
  const facet = STL.match(/facet normal[\s\S]*?endfacet/)[0];
  const degenerate =
    "facet normal 0 0 0\nouter loop\nvertex 0 0 0\nvertex 0 0 0\nvertex 1 1 1\nendloop\nendfacet\n";
  const dirty = STL.replace(
    "endsolid",
    facet + "\n" + degenerate + "\nendsolid",
  );
  await fs.writeFile(source, dirty);
  const buffer = await fs.readFile(source),
    result = await meshTask(
      buffer,
      optionsOf({
        scale: 200,
        rotation: [0, 0, 90],
        removeDegenerate: true,
        removeDuplicates: true,
      }),
    );
  assert.equal(result.before.triangles, 6);
  assert.equal(result.before.duplicates, 1);
  assert.equal(result.before.degenerate, 1);
  assert.equal(result.after.triangles, 4);
  assert.equal(result.after.boundaryEdges, 0);
  assert.equal(result.after.nonManifoldEdges, 0);
  assert.deepEqual(result.after.dimensions.map(Math.round), [40, 40, 40]);
  const plan = {
    ...result,
    id: crypto.randomUUID(),
    source: fileRecord(source, await fs.stat(source), root),
    sourceHash: await hashFile(source),
    options: { scale: 200, rotation: [0, 0, 90] },
  };
  const destination = path.join(root, "edited.stl");
  await exportEdited(plan, destination, root);
  assert.equal(await hashFile(source), plan.sourceHash);
  assert.equal(
    (await meshTask(await fs.readFile(destination))).before.triangles,
    4,
  );
  await assert.rejects(
    exportEdited({ ...plan, id: crypto.randomUUID() }, destination, root),
    /exist/i,
  );
  await assert.rejects(exportEdited(plan, source, root), /original/);
  await fs.writeFile(source, STL);
  await assert.rejects(
    exportEdited(plan, path.join(root, "stale.stl"), root),
    /changed/,
  );
  assert.throws(() => optionsOf({ scale: 0, rotation: [0, 0, 0] }));
});
