const { _electron: electron } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path");
const { fixture, STL } = require("./helpers.cjs");
(async () => {
  const root = await fixture("production"),
    source = path.join(root, "models");
  await fs.mkdir(source);
  const original = path.join(source, "calibration.stl");
  await fs.writeFile(original, STL);
  const gcode = path.join(root, "sliced.gcode");
  await fs.writeFile(
    gcode,
    "; estimated printing time (normal mode) = 2h\n; filament used [g] = 100\nG1 X1",
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
    const page = await app.firstWindow(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.getByLabel("Folder or drive path").fill(source);
    await page.getByRole("button", { name: "Add typed path" }).click();
    await page
      .getByRole("button", { name: "Search locations", exact: true })
      .click();
    await page.getByText("1 files discovered").waitFor();
    await page.locator("tbody .filename").first().click();
    await page.getByText("Bounding box", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Estimate printing cost", exact: true })
      .click();
    await page.getByLabel("Profile name", { exact: true }).fill("Test FDM");
    await page.getByLabel("Material pack price", { exact: true }).fill("20");
    await page.getByLabel("Printer purchase / allocated cost").fill("1000");
    await page.getByLabel("Expected productive lifetime (hours)").fill("1000");
    await page.getByLabel("Maintenance cost / hour").fill(".5");
    await page.getByLabel("Average printer power (W)").fill("100");
    await page.getByLabel("Electricity price / kWh").fill(".2");
    await page.getByText("Labor & allowances", { exact: true }).click();
    for (const [label, value] of [
      ["Labor rate / hour", "30"],
      ["Setup labor / job (minutes)", "10"],
      ["Finishing labor / part (minutes)", "2"],
      ["Consumables / job", "1"],
      ["Packaging / finished part", ".5"],
      ["Failed full builds (%)", "20"],
      ["Target gross margin (%)", "25"],
    ])
      await page.getByLabel(label, { exact: true }).fill(value);
    await app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
    }, gcode);
    await page
      .getByRole("button", { name: "Read estimates from G-code…" })
      .click();
    await page
      .getByText("Review the imported time, material amount, and part count.", {
        exact: false,
      })
      .waitFor();
    await page
      .getByLabel("Print time (hours)")
      .inputValue()
      .then((v) => assert.equal(v, "2"));
    await page.getByLabel("Finished parts per job").fill("2");
    await page
      .locator(".cost-total strong")
      .filter({ hasText: "USD 16.80" })
      .waitFor();
    await page
      .getByRole("button", { name: "Save profile", exact: true })
      .click();
    await page.getByText("Profile saved locally.", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Save estimate with model" })
      .click();
    await page
      .getByText(
        "Estimate saved with this model and its profile assumptions.",
        { exact: true },
      )
      .waitFor();
    const profilePath = path.join(root, "export-profile.json");
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    }, profilePath);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page
      .getByText("Profile exported to " + profilePath, { exact: true })
      .waitFor();
    assert.equal(
      JSON.parse(await fs.readFile(profilePath, "utf8")).format,
      "model-scout-cost-profile",
    );
    const imported = JSON.parse(await fs.readFile(profilePath, "utf8"));
    imported.profile.technology = "resin";
    imported.profile.materialUnit = "ml";
    imported.profile.name = "Test resin";
    const importPath = path.join(root, "resin-profile.json");
    await fs.writeFile(importPath, JSON.stringify(imported));
    await page.locator('input[type="file"]').setInputFiles(importPath);
    await page
      .getByText("Profile imported for review. Save it to keep it.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page.getByLabel("Technology", { exact: true }).inputValue(),
      "resin",
    );
    await page.getByLabel("Wash / cure equipment wear per job").fill("2");
    await page
      .getByLabel("Material for whole job (ml)", { exact: true })
      .fill("100");
    await page.screenshot({ path: "artifacts/cost-studio.png" });
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Estimate printing cost", exact: true })
      .click();
    await page
      .getByText("Loaded the last saved estimate for this file.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page.getByLabel("Profile name", { exact: true }).inputValue(),
      "Test FDM",
    );
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Check mesh / edit a copy", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Run mesh checks", exact: true })
      .click();
    await page
      .getByText("Basic mesh checks complete.", { exact: true })
      .waitFor();
    await page.getByLabel("Uniform scale (%)").fill("200");
    await page.getByLabel("Rotate Z (°)").fill("90");
    await page
      .getByRole("button", { name: "Prepare edited preview", exact: true })
      .click();
    await page.getByText("40 × 40 × 40", { exact: true }).waitFor();
    await page.locator(".edited-preview .preview-caption").waitFor();
    await page.screenshot({ path: "artifacts/mesh-studio.png" });
    const output = path.join(root, "edited.stl");
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    }, output);
    await page.getByRole("button", { name: "Save new STL copy…" }).click();
    await page
      .getByText("Verified edited copy saved:", { exact: false })
      .waitFor();
    assert.equal(await fs.readFile(original, "utf8"), STL);
    assert.ok((await fs.stat(output)).size > 0);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        ok: true,
        steps: [
          "FDM costs and exact expected total",
          "G-code import",
          "profile save/export/import",
          "resin fields",
          "model estimate persistence",
          "mesh diagnostics",
          "scale and rotation preview",
          "verified new STL copy",
        ],
        root,
        errors,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
