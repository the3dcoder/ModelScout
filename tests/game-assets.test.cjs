const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Catalog } = require("../app/catalog.cjs");
const { scan } = require("../app/scanner.cjs");
const { fixture, zip } = require("./helpers.cjs");

test("game scans retain runtime, source, unknown and extensionless files without opening archives", async () => {
  const root = await fixture("game-scan");
  const files = {
    "sprite.PNG": "image",
    "music.ogg": "audio",
    "level.tmx": "<map/>",
    "tiles.tsx": "<tileset/>",
    LICENSE: "license",
    "editor.aseprite": "source",
    "unknown.custom": "unknown",
    "model.stl": "mesh",
    "pack.zip": zip({ "inside.png": "image" }),
  };
  for (const [name, data] of Object.entries(files))
    await fs.writeFile(path.join(root, name), data);
  const c = new Catalog(path.join(root, "models.sqlite"));
  // Keep the catalog outside the scanned folder so the snapshot is immutable.
  const source = path.join(root, "source");
  await fs.mkdir(source);
  for (const [name, data] of Object.entries(files))
    await fs.writeFile(path.join(source, name), data);
  await scan({ roots: [source] }, c, new AbortController().signal, () => {});
  assert.equal(c.stats().total, 1);
  await scan(
    { roots: [source], mode: "game" },
    c,
    new AbortController().signal,
    () => {},
  );
  assert.equal(c.stats().total, 9);
  assert.equal(c.query({ search: "inside" }).count, 0);
  assert.equal(
    c.query({ search: "license" }).rows[0].family,
    "Documentation & licenses",
  );
  assert.equal(
    c.query({ search: "sprite" }).rows[0].family,
    "Images & textures",
  );
  assert.equal(c.query({ search: "unknown" }).rows[0].family, "Other files");
  assert.equal(c.query({ family: "Audio" }).count, 1);
  assert.equal(c.query({ ext: "(none)" }).count, 1);
  assert.equal(
    c.savedSearches("Audio files", { family: "Audio" })[0].query.family,
    "Audio",
  );
  await scan(
    { roots: [source], mode: "game", archives: true },
    c,
    new AbortController().signal,
    () => {},
  );
  assert.equal(c.stats().total, 10);
  assert.equal(c.query({ search: "inside" }).rows[0].member, "inside.png");
  c.db.close();
});

test("unique catalog exports verified hashes, all aliases and historical paths; reviewed copies retain originals", async () => {
  const { prepareLibrary, copyLibrary } = require("../app/game-library.cjs");
  const root = await fixture("game-library"),
    source = path.join(root, "source"),
    out = path.join(root, "output");
  await fs.mkdir(source);
  await fs.mkdir(out);
  const pack = path.join(source, "01_WORLD_TERRAIN_TILES", "Pack");
  await fs.mkdir(pack, { recursive: true });
  await fs.writeFile(path.join(pack, "prefixed.png"), "identical image");
  await fs.writeFile(path.join(pack, "other.png"), "identical image");
  await fs.writeFile(
    path.join(pack, "map.tmx"),
    '<map><tileset source="tiles.tsx"/></map>',
  );
  await fs.mkdir(path.join(source, "00_CATALOG"));
  await fs.writeFile(
    path.join(source, "00_CATALOG", "FILE_INDEX.jsonl"),
    JSON.stringify({
      destination_relative_path: "01_WORLD_TERRAIN_TILES/Pack/prefixed.png",
      source_relative_path: "original/tiles.png",
      pack_name: "Terrain Pack",
      pack_id: "P0001",
      sha256: "outdated",
    }) + "\n",
  );
  const c = new Catalog(path.join(root, "catalog.sqlite"));
  await scan(
    { roots: [source], mode: "game" },
    c,
    new AbortController().signal,
    () => {},
  );
  const prepared = await prepareLibrary(
    c,
    { search: ".png" },
    out,
    new AbortController().signal,
    () => {},
  );
  assert.equal(prepared.summary.files, 2);
  assert.equal(prepared.summary.uniqueFiles, 1);
  assert.equal(prepared.summary.duplicateCopies, 1);
  const aliases = (
    await fs.readFile(path.join(prepared.directory, "sources.jsonl"), "utf8")
  )
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.equal(aliases.length, 2);
  assert.equal(
    aliases[0].canonicalRelativePath,
    aliases[1].canonicalRelativePath,
  );
  assert.equal(
    aliases.find((x) => x.name === "prefixed.png").historical
      .sourceRelativePath,
    "original/tiles.png",
  );
  const result = await copyLibrary(
    prepared,
    new AbortController().signal,
    () => {},
  );
  assert.equal(result.copied, 1);
  assert.equal(result.failed, 0);
  assert.equal(
    await fs.readFile(
      path.join(prepared.directory, aliases[0].canonicalRelativePath),
      "utf8",
    ),
    "identical image",
  );
  assert.equal(
    await fs.readFile(path.join(pack, "other.png"), "utf8"),
    "identical image",
  );
  await assert.rejects(
    copyLibrary(prepared, new AbortController().signal, () => {}),
    /already|review/i,
  );
  const maps = await prepareLibrary(
    c,
    { search: "map.tmx" },
    out,
    new AbortController().signal,
    () => {},
  );
  const mapRecord = JSON.parse(
    (
      await fs.readFile(path.join(maps.directory, "assets.jsonl"), "utf8")
    ).trim(),
  );
  assert.equal(mapRecord.referenceReview, true);
  assert.match(
    await fs.readFile(path.join(maps.directory, "START_HERE.md"), "utf8"),
    /reference/i,
  );
  const changed = await prepareLibrary(
    c,
    { search: "prefixed.png" },
    out,
    new AbortController().signal,
    () => {},
  );
  await fs.writeFile(path.join(pack, "prefixed.png"), "changed content");
  const blocked = await copyLibrary(
    changed,
    new AbortController().signal,
    () => {},
  );
  assert.equal(blocked.failed, 1);
  assert.equal(blocked.copied, 0);
  assert.equal(c.query({ search: ".png", kind: "unique" }).count, 1);
  assert.equal(
    c.query({
      search: "other.png",
      kind: "unique",
      family: "Images & textures",
    }).count,
    1,
  );
  await assert.rejects(
    prepareLibrary(
      c,
      {},
      path.join(source, "00_CATALOG"),
      new AbortController().signal,
      () => {},
    ),
    /outside/,
  );
  c.db.close();
});

test("cancelled, changed and tampered plans never copy; category indexes retain cross-category aliases", async () => {
  const { prepareLibrary, copyLibrary } = require("../app/game-library.cjs");
  const root = await fixture("game-blocks"),
    source = path.join(root, "source"),
    out = path.join(root, "out");
  await fs.mkdir(source);
  await fs.mkdir(out);
  for (const folder of ["World Terrain", "UI HUD"]) {
    await fs.mkdir(path.join(source, folder));
    await fs.writeFile(path.join(source, folder, "tiles.png"), "same");
  }
  const c = new Catalog(path.join(root, "catalog.sqlite"));
  await scan(
    { roots: [source], mode: "game" },
    c,
    new AbortController().signal,
    () => {},
  );
  const plan = await prepareLibrary(
    c,
    {},
    out,
    new AbortController().signal,
    () => {},
  );
  assert.equal(plan.summary.categories.length, 2);
  assert.equal(plan.summary.uniqueFiles, 1);
  await fs.appendFile(path.join(plan.directory, "copy-plan.jsonl"), "\n");
  await assert.rejects(
    copyLibrary(plan, new AbortController().signal, () => {}),
    /plan changed/,
  );
  const controller = new AbortController();
  controller.abort();
  const cancelled = await prepareLibrary(
    c,
    {},
    out,
    controller.signal,
    () => {},
  );
  assert.equal(cancelled.summary.status, "cancelled");
  await assert.rejects(
    copyLibrary(cancelled, new AbortController().signal, () => {}),
    /complete catalog/,
  );
  await fs.writeFile(
    path.join(source, "World Terrain", "tiles.png"),
    "changed size",
  );
  const incomplete = await prepareLibrary(
    c,
    {},
    out,
    new AbortController().signal,
    () => {},
  );
  assert.equal(incomplete.summary.status, "incomplete");
  assert.equal(incomplete.summary.errorCount, 1);
  await assert.rejects(
    copyLibrary(incomplete, new AbortController().signal, () => {}),
    /complete catalog/,
  );
  c.db.close();
});

test("category index writers retain every row when cycling more categories than open handles", async () => {
  const { prepareLibrary } = require("../app/game-library.cjs");
  const root = await fixture("game-indexes"),
    source = path.join(root, "source"),
    out = path.join(root, "out");
  await fs.mkdir(source);
  await fs.mkdir(out);
  for (let i = 0; i < 90; i++)
    await fs.writeFile(path.join(source, `asset-${i}.bin`), `unique ${i}`);
  const c = new Catalog(path.join(root, "catalog.sqlite"));
  await scan(
    { roots: [source], mode: "game" },
    c,
    new AbortController().signal,
    () => {},
  );
  for (const row of c.iterateFiles())
    c.annotate(row.id, `Category ${Number(row.name.match(/\d+/)[0]) % 30}`, "");
  const prepared = await prepareLibrary(
    c,
    {},
    out,
    new AbortController().signal,
    () => {},
  );
  assert.equal(prepared.summary.uniqueFiles, 90);
  assert.equal(prepared.summary.categories.length, 30);
  for (const category of prepared.summary.categories) {
    const lines = (
      await fs.readFile(path.join(prepared.directory, category.index), "utf8")
    )
      .trim()
      .split("\n");
    assert.equal(lines.length, 3);
    for (const line of lines)
      assert.equal(JSON.parse(line).category, category.category);
  }
  for (const name of ["assets.jsonl", "sources.jsonl", "copy-plan.jsonl"])
    assert.equal(
      (await fs.readFile(path.join(prepared.directory, name), "utf8"))
        .trim()
        .split("\n").length,
      90,
    );
  c.db.close();
});

test("large category indexes are chunked and physical assets use hash-prefix subfolders", async () => {
  const { prepareLibrary } = require("../app/game-library.cjs");
  const root = await fixture("game-chunks"),
    source = path.join(root, "source"),
    out = path.join(root, "out");
  await fs.mkdir(source);
  await fs.mkdir(out);
  for (let i = 0; i < 1005; i++)
    await fs.writeFile(path.join(source, `asset-${i}.bin`), `unique ${i}`);
  const c = new Catalog(path.join(root, "catalog.sqlite"));
  await scan(
    { roots: [source], mode: "game" },
    c,
    new AbortController().signal,
    () => {},
  );
  const prepared = await prepareLibrary(
    c,
    {},
    out,
    new AbortController().signal,
    () => {},
  );
  const category = prepared.summary.categories[0];
  assert.equal(category.indexes.length, 2);
  const counts = [];
  for (const file of category.indexes) {
    const rows = (
      await fs.readFile(path.join(prepared.directory, file), "utf8")
    )
      .trim()
      .split("\n")
      .map(JSON.parse);
    counts.push(rows.length);
    for (const row of rows)
      assert.equal(
        path.posix.basename(path.posix.dirname(row.canonicalRelativePath)),
        row.sha256.slice(0, 2),
      );
  }
  assert.deepEqual(counts, [1000, 5]);
  c.db.close();
});

test("unique-view preparation rehashes matching aliases and preserves remaining filters", async () => {
  const { prepareLibrary } = require("../app/game-library.cjs");
  const root = await fixture("game-unique-scope"),
    source = path.join(root, "source"),
    out = path.join(root, "out");
  await fs.mkdir(source);
  await fs.mkdir(out);
  for (const name of ["first.png", "second.png", "audio.ogg"])
    await fs.writeFile(path.join(source, name), "identical content");
  const c = new Catalog(path.join(root, "catalog.sqlite"));
  await scan(
    { roots: [source], mode: "game" },
    c,
    new AbortController().signal,
    () => {},
  );
  await prepareLibrary(c, {}, out, new AbortController().signal, () => {});
  const query = { kind: "unique", family: "Images & textures" };
  assert.equal(c.query(query).count, 1);
  const plan = await prepareLibrary(
    c,
    query,
    out,
    new AbortController().signal,
    () => {},
  );
  assert.equal(plan.summary.files, 2);
  assert.equal(plan.summary.uniqueFiles, 1);
  assert.equal(plan.summary.duplicateCopies, 1);
  const aliases = (
    await fs.readFile(path.join(plan.directory, "sources.jsonl"), "utf8")
  )
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.deepEqual(aliases.map((r) => r.name).sort(), [
    "first.png",
    "second.png",
  ]);
  await fs.writeFile(path.join(source, "second.png"), "edited duplicate");
  const stale = await prepareLibrary(
    c,
    query,
    out,
    new AbortController().signal,
    () => {},
  );
  assert.equal(stale.summary.status, "incomplete");
  assert.equal(stale.summary.errorCount, 1);
  c.db.close();
});

test("filtered library destinations stay outside every scan root including unmatched and empty roots", async () => {
  const { prepareLibrary } = require("../app/game-library.cjs");
  const root = await fixture("game-root-scope"),
    source = path.join(root, "source"),
    excluded = path.join(root, "excluded"),
    empty = path.join(root, "empty");
  for (const dir of [source, excluded, empty]) await fs.mkdir(dir);
  await fs.writeFile(path.join(source, "sprite.png"), "image");
  await fs.writeFile(path.join(excluded, "audio.ogg"), "audio");
  const c = new Catalog(path.join(root, "catalog.sqlite"));
  await scan(
    { roots: [source, excluded, empty], mode: "game" },
    c,
    new AbortController().signal,
    () => {},
  );
  for (const destination of [excluded, empty]) {
    await assert.rejects(
      prepareLibrary(
        c,
        { search: "sprite" },
        destination,
        new AbortController().signal,
        () => {},
      ),
      /outside/,
    );
    assert.equal(
      (await fs.readdir(destination)).some((name) =>
        name.startsWith("Asset-Library"),
      ),
      false,
    );
  }
  c.db.close();
});

test("cancelled and interrupted mode changes restore catalog mode and roots with attempted scope recorded", async () => {
  const root = await fixture("game-cancel-mode"),
    source = path.join(root, "source"),
    attempted = path.join(root, "attempted"),
    database = path.join(root, "catalog.sqlite");
  await fs.mkdir(source);
  await fs.mkdir(attempted);
  await fs.writeFile(path.join(source, "sprite.png"), "image");
  await fs.writeFile(path.join(attempted, "model.stl"), "mesh");
  let c = new Catalog(database);
  await scan(
    { roots: [source], mode: "game" },
    c,
    new AbortController().signal,
    () => {},
  );
  const controller = new AbortController();
  const result = await scan(
    { roots: [attempted], mode: "models" },
    c,
    controller.signal,
    (state) => {
      if (state.running) controller.abort();
    },
  );
  assert.equal(result.mode, "game");
  assert.deepEqual(result.roots, [source]);
  assert.equal(result.attemptedMode, "models");
  assert.deepEqual(result.attemptedRoots, [attempted]);
  assert.equal(c.query({ family: "Images & textures" }).count, 1);
  c.db.close();
  c = new Catalog(database);
  assert.equal(c.setting("lastScan").mode, "game");
  c.beginScan();
  c.setting("lastScan", {
    mode: "models",
    roots: [attempted],
    running: true,
    phase: "files",
  });
  c.db.close();
  c = new Catalog(database);
  assert.equal(c.setting("lastScan").mode, "game");
  assert.deepEqual(c.setting("lastScan").roots, [source]);
  assert.equal(c.setting("lastScan").attemptedMode, "models");
  assert.equal(c.setting("lastScan").restoredPrevious, true);
  assert.equal(c.query({ family: "Images & textures" }).count, 1);
  c.db.close();
});
