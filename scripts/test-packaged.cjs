const { spawnSync } = require("node:child_process");
for (const file of [
  "app",
  "library-app",
  "production-app",
  "organization-app",
  "importers-app",
  "geometry-app",
  "reliability-app",
]) {
  const result = spawnSync(process.execPath, [`tests/${file}.test.cjs`], {
    stdio: "inherit",
    env: { ...process.env, SCOUT_PACKAGED: "1" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
