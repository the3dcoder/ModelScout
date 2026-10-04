const { spawnSync } = require("node:child_process");
const args = ["--test"];
if (process.env.SCOUT_RETAIN_FIXTURES === "1")
  args.push(
    "--test-skip-pattern=copy preserves source|collections persist|OBJ transfers|cached comparison resumes",
  );
args.push(
  ...[
    "core",
    "enhancements",
    "organization",
    "geometry",
    "reliability",
    "game-assets",
  ].map((name) => `tests/${name}.test.cjs`),
);
const result = spawnSync(process.execPath, args, {
  stdio: "inherit",
  env: process.env,
});
if (result.error) throw result.error;
process.exitCode = result.status || 0;
