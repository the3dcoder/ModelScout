const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { Catalog } = require("../app/catalog.cjs");
const { scan } = require("../app/scanner.cjs");
const { fixture, zip } = require("./helpers.cjs");

test("name search excludes inherited paths and metadata, with explicit broader scopes", async () => {
  const root = await fixture("Flex-search");
  await fs.writeFile(path.join(root, "Flex Dragon.scad"), "cube(1);");
  await fs.writeFile(path.join(root, "bracket.scad"), "sphere(2);");
  await fs.writeFile(path.join(root, "100%_part.scad"), "cube(3);");
  const catalog = new Catalog(":memory:");
  try {
    await scan(
      { roots: [root] },
      catalog,
      new AbortController().signal,
      () => {},
    );
    const bracket = catalog.query({ search: "bracket" }).rows[0];
    catalog.annotate(bracket.id, "Flex category", "Flex notes");
    assert.deepEqual(
      catalog.query({ search: "fLeX" }).rows.map((r) => r.name),
      ["Flex Dragon.scad"],
    );
    assert.equal(
      catalog.query({ search: "Flex", searchScope: "path" }).count,
      3,
    );
    assert.equal(
      catalog.query({ search: "Flex", searchScope: "all" }).count,
      3,
    );
    assert.equal(catalog.query({ search: '"flex dragon"' }).count, 1);
    assert.equal(catalog.query({ search: "100%_" }).count, 1);
    assert.equal(catalog.ids({ search: "Flex" }).length, 1);
    const saved = catalog.savedSearches("Paths", {
      search: "Flex",
      searchScope: "path",
    });
    assert.equal(saved[0].query.searchScope, "path");
  } finally {
    catalog.close();
  }
});

test("matching folders and archive names are separate results without inherited contents", async () => {
  const root = await fixture("containers");
  const folder = path.join(root, "Flex animals");
  await fs.mkdir(folder);
  await fs.writeFile(path.join(folder, "ordinary.scad"), "cube(1);");
  await fs.writeFile(
    path.join(root, "Flex pack.zip"),
    zip({ "nested/ordinary.stl": "not a mesh" }),
  );
  const catalog = new Catalog(":memory:");
  try {
    for (const archives of [false, true]) {
      await scan(
        { roots: [root], archives },
        catalog,
        new AbortController().signal,
        () => {},
      );
      const result = catalog.query({ search: "flex" });
      assert.equal(result.count, 0);
      assert.deepEqual(
        result.locations.rows.map((r) => [r.name, r.kind]),
        [
          ["Flex animals", "folder"],
          ["Flex pack.zip", "archive"],
        ],
      );
      assert.equal(result.locations.count, 2);
      assert.equal(catalog.query({}).locations.count, 0);
    }
    catalog.beginScan();
    catalog.finishScan(true);
    assert.equal(catalog.query({ search: "flex" }).locations.count, 2);
  } finally {
    catalog.close();
  }
});

test("large selected G-code uses the same bounded estimates reader as the picker", async () => {
  const root = await fixture("large-gcode");
  const file = path.join(root, "large.gcode");
  const h = await fs.open(file, "wx");
  const bytes = 128 * 1024 * 1024 + 1;
  const footer = Buffer.from("\n;TIME:7200\n;filament used [g] = 25\n");
  try {
    await h.truncate(bytes);
    await h.write(footer, 0, footer.length, bytes - footer.length);
  } finally {
    await h.close();
  }
  const stat = await fs.stat(file);
  const row = {
    path: file,
    name: "large.gcode",
    ext: "gcode",
    member: "",
    size: stat.size,
    mtime: stat.mtimeMs,
    ctime: stat.ctimeMs,
  };
  const moduleFile = path.resolve("app/costs.cjs");
  const scopedRequire = createRequire(moduleFile);
  const context = {
    module: { exports: {} },
    Buffer,
    require: (n) =>
      n === "electron"
        ? {
            dialog: {
              showOpenDialog: async () => ({
                canceled: false,
                filePaths: [file],
              }),
            },
          }
        : scopedRequire(n),
  };
  vm.runInNewContext(await fs.readFile(moduleFile, "utf8"), context, {
    filename: moduleFile,
    importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
  });
  const handlers = {};
  context.module.exports({
    handle: (name, fn) => (handlers[name] = fn),
    catalog: {},
    win: null,
    row: () => row,
  });
  const selected = await handlers.importGcodeCost("id");
  const picked = await handlers.importGcodeCost();
  assert.deepEqual(selected, picked);
  assert.equal(selected.hours, 2);
  assert.equal(selected.grams, 25);
  await assert.rejects(
    () =>
      require("../app/gcode.cjs").readEstimatesText({
        ...row,
        member: "large.gcode",
      }),
    /128 MiB/,
  );
  await fs.appendFile(file, "changed");
  await assert.rejects(
    () => handlers.importGcodeCost("id"),
    /changed since scanning/,
  );
});

test("case-insensitive name searches include Unicode filenames and folder names", async () => {
  const root = await fixture("unicode-search");
  await fs.mkdir(path.join(root, "Équerres"));
  await fs.writeFile(path.join(root, "Équerres", "ÉQUERRE.scad"), "cube(1);");
  const catalog = new Catalog(":memory:");
  try {
    await scan(
      { roots: [root] },
      catalog,
      new AbortController().signal,
      () => {},
    );
    const result = catalog.query({ search: "équerre" });
    assert.equal(result.count, 1);
    assert.equal(result.locations.count, 1);
  } finally {
    catalog.close();
  }
});

test("v4 migration and interrupted rescans retain models, metadata, saved scopes and locations", async () => {
  const root = await fixture("v4-recovery"),
    db = path.join(root, "catalog.sqlite");
  await fs.writeFile(path.join(root, "Flex.scad"), "cube(1);");
  let c = new Catalog(db);
  await scan({ roots: [root] }, c, new AbortController().signal, () => {});
  const row = c.query().rows[0];
  c.annotate(row.id, "Reviewed", "Preserve this note");
  c.metadata([row.id], { tags: ["kept"], favorite: true });
  c.setting("savedSearches", [{ name: "Legacy", query: { search: "Flex" } }]);
  c.db.exec("DROP TABLE locations; PRAGMA user_version=4");
  c.close();
  c = new Catalog(db);
  try {
    assert.ok(c.backupPath.includes("before-v5"));
    assert.ok((await fs.stat(c.backupPath)).size > 0);
    assert.equal(c.get(row.id).notes, "Preserve this note");
    assert.equal(c.get(row.id).favorite, 1);
    assert.deepEqual(c.get(row.id).tags, ["kept"]);
    assert.equal(c.query(c.savedSearches()[0].query).count, 1);
    await scan({ roots: [root] }, c, new AbortController().signal, () => {});
    const locationCount = c.query({ search: "v4-recovery" }).locations.count;
    c.beginScan();
    c.close();
    c = new Catalog(db);
    assert.equal(
      c.query({ search: "v4-recovery" }).locations.count,
      locationCount,
    );
    assert.equal(c.get(row.id).notes, "Preserve this note");
    assert.equal(c.query().count, 1);
  } finally {
    c.close();
  }
});
