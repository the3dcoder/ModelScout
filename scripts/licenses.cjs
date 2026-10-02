const fs = require("node:fs/promises");
const path = require("node:path");
const upstream = [
  [
    "OCCT-LICENSE_LGPL_21.txt",
    "Open-Cascade-SAS/OCCT",
    "d2abb6d844231cb8f29be6894440874a4700e4a5",
    "LICENSE_LGPL_21.txt",
  ],
  [
    "OCCT-LGPL_EXCEPTION.txt",
    "Open-Cascade-SAS/OCCT",
    "d2abb6d844231cb8f29be6894440874a4700e4a5",
    "OCCT_LGPL_EXCEPTION.txt",
  ],
  [
    "assimp-LICENSE.txt",
    "assimp/assimp",
    "cf7d36376658891c5abb0e9fb4fde8ee45be1db3",
    "LICENSE",
  ],
];
(async () => {
  await fs.mkdir("notices", { recursive: true });
  for (const [file, repo, revision, source] of upstream) {
    const response = await fetch(
      `https://raw.githubusercontent.com/${repo}/${revision}/${source}`,
      { signal: AbortSignal.timeout(30000) },
    );
    if (!response.ok)
      throw new Error(`Could not retrieve ${file}: ${response.status}`);
    await fs.writeFile(path.join("notices", file), await response.text());
  }
  const lock = JSON.parse(await fs.readFile("package-lock.json", "utf8"));
  const sections = [
    "Model Scout runtime dependency notices",
    "Model Scout's original code is MIT licensed. The following components retain their own terms.",
  ];
  for (const [dir, data] of Object.entries(lock.packages).sort()) {
    if (!dir || data.dev) continue;
    const pkg = JSON.parse(
      await fs.readFile(path.join(dir, "package.json"), "utf8"),
    );
    const files = (await fs.readdir(dir)).filter((file) =>
      /^(licen[sc]e|copying|notice)(\.|$)/i.test(file),
    );
    if (!files.length)
      throw new Error(
        `No license found for ${pkg.name}; review before packaging.`,
      );
    sections.push(
      `\n${"=".repeat(70)}\n${pkg.name} ${pkg.version} — ${JSON.stringify(pkg.license || data.license)}\n`,
    );
    for (const file of files) {
      if ((await fs.stat(path.join(dir, file))).isFile())
        sections.push(await fs.readFile(path.join(dir, file), "utf8"));
    }
  }
  for (const [file] of upstream)
    sections.push(
      `\n${"=".repeat(70)}\n${file}\n`,
      await fs.readFile(path.join("notices", file), "utf8"),
    );
  sections.push(
    "\nElectron and Chromium notices are also shipped by electron-builder as LICENSE.electron.txt and LICENSES.chromium.html alongside the executable.",
  );
  await fs.writeFile("notices/RUNTIME-NOTICES.txt", sections.join("\n"));
  console.log(
    "Runtime notices generated from locked dependencies and pinned upstream sources.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
