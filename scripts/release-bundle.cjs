const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { version } = require("../package.json");
const sources = [
  {
    name: "occt-import-js",
    version: "0.0.23",
    repo: "kovacsv/occt-import-js",
    ref: "c2148e54b456b571238d35cac037d304053d64b2",
    wasm: "dist/occt-import-js.wasm",
  },
  {
    name: "OCCT",
    repo: "Open-Cascade-SAS/OCCT",
    ref: "d2abb6d844231cb8f29be6894440874a4700e4a5",
  },
  {
    name: "assimpjs",
    version: "0.0.10",
    repo: "kovacsv/assimpjs",
    ref: "b5dd7726fe10ded63280ee10c91ed54746a82087",
    wasm: "dist/assimpjs.wasm",
  },
  {
    name: "assimp",
    repo: "assimp/assimp",
    ref: "cf7d36376658891c5abb0e9fb4fde8ee45be1db3",
  },
];
const sha = (data) => crypto.createHash("sha256").update(data).digest("hex");
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(300000) });
  if (!response.ok)
    throw new Error(`Download failed (${response.status}): ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 200 * 1024 * 1024)
    throw new Error("Unexpected source archive size.");
  return buffer;
}
(async () => {
  const out = path.resolve("release", version),
    content = path.join(out, "public-bundle"),
    sourceDir = path.join(content, "sources");
  await fs.access(path.join(out, `Model-Scout-${version}.exe`)).catch(() => {
    throw new Error(
      "Complete npm run package before assembling the release bundle.",
    );
  });
  await fs.mkdir(sourceDir, { recursive: true });
  const manifest = [];
  for (const source of sources) {
    if (source.wasm) {
      const pkg = JSON.parse(
        await fs.readFile(`node_modules/${source.name}/package.json`, "utf8"),
      );
      if (pkg.version !== source.version)
        throw new Error(
          `Update pinned source revisions for ${source.name} ${pkg.version} before releasing.`,
        );
      const binary = await fs.readFile(
        `node_modules/${source.name}/${source.wasm}`,
      );
      const published = await download(
        `https://raw.githubusercontent.com/${source.repo}/${source.ref}/${source.wasm}`,
      );
      if (sha(binary) !== sha(published))
        throw new Error(
          `Installed ${source.name} WASM does not match the pinned source revision.`,
        );
      source.wasmSha256 = sha(binary);
    }
    const filename = `${source.name}-${source.ref}.tar.gz`,
      target = path.join(sourceDir, filename);
    let buffer;
    try {
      buffer = await fs.readFile(target);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      buffer = await download(
        `https://codeload.github.com/${source.repo}/tar.gz/${source.ref}`,
      );
      await fs.writeFile(target, buffer, { flag: "wx" });
    }
    manifest.push({
      ...source,
      filename,
      sha256: sha(buffer),
      bytes: buffer.length,
    });
    console.log(`Source ready: ${source.name}`);
  }
  await fs.writeFile(
    path.join(sourceDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  await fs.copyFile(
    "docs/BUILD_IMPORTERS.md",
    path.join(sourceDir, "README.md"),
  );
  await fs.copyFile(
    "docs/THIRD_PARTY.md",
    path.join(content, "THIRD_PARTY.md"),
  );
  await fs.copyFile("LICENSE", path.join(content, "LICENSE"));
  await fs.cp("notices", path.join(content, "notices"), { recursive: true });
  const executable = `Model-Scout-${version}.exe`;
  await fs.copyFile(path.join(out, executable), path.join(content, executable));
  const hash = sha(await fs.readFile(path.join(out, executable)));
  await fs.writeFile(
    path.join(out, `${executable}.sha256`),
    `${hash}  ${executable}\n`,
  );
  const zip = path.join(out, `Model-Scout-${version}-Windows-x64.zip`);
  if (
    await fs.stat(zip).then(
      () => true,
      (e) => {
        if (e.code === "ENOENT") return false;
        throw e;
      },
    )
  )
    throw new Error(
      "Release ZIP already exists. Retain it and choose a fresh output before bundling again.",
    );
  const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
  const entries = (await fs.readdir(content))
    .map((file) => quote(path.join(content, file)))
    .join(",");
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Compress-Archive -LiteralPath @(${entries}) -DestinationPath ${quote(zip)}`,
    ],
    { stdio: "inherit", windowsHide: true },
  );
  const zipHash = sha(await fs.readFile(zip));
  await fs.writeFile(`${zip}.sha256`, `${zipHash}  ${path.basename(zip)}\n`);
  console.log(`Public bundle: ${zip}\nSHA-256: ${zipHash}`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
