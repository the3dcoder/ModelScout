const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { fixture } = require("./helpers.cjs");
(async () => {
  const root = await fixture("importers"),
    source = path.join(root, "models");
  await fs.mkdir(source);
  // Upstream's test cube stays in node_modules; no third-party model is added to the repository.
  await fs.copyFile(
    "node_modules/occt-import-js/test/testfiles/simple-basic-cube/cube.stp",
    path.join(source, "cube.stp"),
  );
  await fs.writeFile(
    path.join(source, "triangle.fbx"),
    require("./model-fixtures.cjs").FBX,
  );
  const env = { ...process.env, SCOUT_TEST_DATA: path.join(root, "profile") };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch(
    process.env.SCOUT_PACKAGED
      ? {
          executablePath: path.resolve(
            `release/${require("../package.json").version}/win-unpacked/Model Scout.exe`,
          ),
          args: [],
          env,
        }
      : { args: [path.resolve(".")], env },
  );
  try {
    const page = await app.firstWindow();
    await page.getByLabel("Folder or drive path").fill(source);
    await page.getByRole("button", { name: "Add typed path" }).click();
    await page
      .getByRole("button", { name: "Search locations", exact: true })
      .click();
    await page.getByText("2 files discovered").waitFor();
    const rows = await page.evaluate(() => window.scout.query());
    const step = rows.rows.find((r) => r.ext === "stp"),
      fbx = rows.rows.find((r) => r.ext === "fbx");
    await page
      .locator("tbody .filename")
      .filter({ hasText: "cube.stp" })
      .click();
    await page.waitForFunction(
      (id) =>
        document.querySelector(".inspector .preview-wrap")?.dataset
          .readyFile === id,
      step.id,
      { timeout: 45000 },
    );
    const converted = await page.evaluate(
      (id) => window.scout.convert(id),
      fbx.id,
    );
    assert.equal(converted.kind, "assimp");
    assert.ok(converted.meshes.length > 0);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Third-party licenses" }).click();
    await page.getByRole("heading", { name: "Third-party licenses" }).waitFor();
    assert.match(
      await page.locator(".license-text").innerText(),
      /GNU LESSER GENERAL PUBLIC LICENSE/,
    );
    console.log(
      JSON.stringify({
        ok: true,
        packaged: !!process.env.SCOUT_PACKAGED,
        checks: [
          "OpenCascade STEP preview",
          "Assimp conversion",
          "license viewer",
        ],
      }),
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
