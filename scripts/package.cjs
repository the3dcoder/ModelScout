const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { version, build } = require("../package.json");
const root = path.resolve("dist", version);
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, ".vite", "manifest.json"), "utf8"),
);
const outputs = new Set(["index.html", "thumbnail.html"]);
for (const entry of Object.values(manifest))
  for (const file of [
    entry.file,
    ...(entry.css || []),
    ...(entry.assets || []),
  ]) {
    if (path.isAbsolute(file) || file.split(/[\\/]/).includes(".."))
      throw new Error("Build manifest contains an unsafe path.");
    outputs.add(file);
  }
const config = {
  ...build,
  files: [
    ...build.files.filter(
      (file) => typeof file !== "string" || !file.startsWith("dist/"),
    ),
    ...[...outputs].map((file) => `dist/${version}/${file}`),
  ],
};
if (fs.existsSync(path.join(build.directories.output, "win-unpacked")))
  throw new Error(
    "Unpacked release already exists. Choose a fresh build output directory to retain the previous build.",
  );
fs.mkdirSync(".local", { recursive: true });
const configPath = path.resolve(
  ".local",
  `package-${version}-${Date.now()}.json`,
);
fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { flag: "wx" });
execFileSync(
  process.execPath,
  [
    require.resolve("electron-builder/cli.js"),
    "--win",
    "portable",
    "--x64",
    "--config",
    configPath,
  ],
  { stdio: "inherit" },
);
