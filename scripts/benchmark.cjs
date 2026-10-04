const fs = require("node:fs/promises");
const path = require("node:path");
const { Catalog } = require("../app/catalog.cjs");
const { scan } = require("../app/scanner.cjs");
const { duplicates } = require("../app/files.cjs");
(async () => {
  if (!process.argv[2] || process.argv[2].startsWith("--"))
    throw new Error(
      "Usage: node scripts/benchmark.cjs <folder> [--game] [--duplicates]",
    );
  const root = path.resolve(process.argv[2]);
  const output = path.resolve("artifacts", "benchmarks", String(Date.now()));
  await fs.mkdir(output, { recursive: true });
  const c = new Catalog(path.join(output, "catalog.sqlite"));
  const receipt = {
    version: require("../package.json").version,
    root,
    note: "Read-only sources; isolated catalog. Timing depends on storage and OS cache.",
  };
  const signal = new AbortController().signal;
  try {
    let start = performance.now();
    receipt.scan = await scan(
      {
        roots: [root],
        archives: false,
        mode: process.argv.includes("--game") ? "game" : "models",
      },
      c,
      signal,
      () => {},
    );
    receipt.scanMs = performance.now() - start;
    if (process.argv.includes("--duplicates")) {
      start = performance.now();
      receipt.duplicates = await duplicates(c, signal, () => {});
      receipt.duplicateMs = performance.now() - start;
    }
    start = performance.now();
    for (let i = 0; i < 20; i++) c.query({ page: i, pageSize: 24 });
    receipt.meanQueryMs = (performance.now() - start) / 20;
    receipt.stats = c.stats();
    await fs.writeFile(
      path.join(output, "receipt.json"),
      JSON.stringify(receipt, null, 2),
    );
    console.log(
      JSON.stringify({
        output,
        scanMs: receipt.scanMs,
        matches: receipt.stats.total,
        errors: receipt.scan.errorCount,
        duplicateMs: receipt.duplicateMs,
        meanQueryMs: receipt.meanQueryMs,
      }),
    );
  } finally {
    c.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
