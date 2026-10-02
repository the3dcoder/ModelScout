const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { fixture, zip } = require("./helpers.cjs");
(async () => {
  const root = await fixture("reliability-app"),
    source = path.join(root, "Flex Library");
  await fs.mkdir(source);
  await fs.mkdir(path.join(source, "Flex animals"));
  await fs.writeFile(
    path.join(source, "Flex animals", "ordinary.scad"),
    "cube(9);",
  );
  await fs.writeFile(path.join(source, "Flex Dragon.scad"), "sphere(9);");
  await fs.writeFile(
    path.join(source, "Flex pack.zip"),
    zip({ "inner/ordinary.stl": "not a mesh" }),
  );
  for (let i = 0; i < 22; i++)
    await fs.mkdir(
      path.join(source, `Flex empty ${String(i).padStart(2, "0")}`),
    );
  for (let i = 0; i < 160; i++)
    await fs.writeFile(
      path.join(source, `part-${String(i).padStart(3, "0")}.scad`),
      "cube(1);" + " ".repeat(i),
    );
  await fs.writeFile(
    path.join(source, "test.gcode"),
    ";TIME:7200\n;filament used [g] = 100\nG1 X1\n",
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
    await page.getByText("163 files discovered", { exact: false }).waitFor();
    // A conversion must be reviewed again when its density assumption changes.
    await page.getByLabel("Search found files").fill("test.gcode");
    await page.getByText("1 results", { exact: true }).waitFor();
    await page.locator("tbody .filename").first().click();
    await page
      .getByRole("button", { name: "Estimate printing cost", exact: true })
      .click();
    await page.getByLabel("Technology", { exact: true }).selectOption("resin");
    await page.getByLabel("Material unit", { exact: true }).selectOption("ml");
    await page.getByLabel("Material density (g/ml)", { exact: true }).fill("1");
    await page
      .getByRole("button", { name: "Use selected G-code file", exact: true })
      .click();
    await page
      .getByText("Review the imported time, material amount, and part count.", {
        exact: false,
      })
      .waitFor();
    assert.equal(
      await page
        .getByLabel("Material for whole job (ml)", { exact: true })
        .inputValue(),
      "100",
    );
    await page.getByLabel("Material density (g/ml)", { exact: true }).fill("2");
    assert.equal(
      await page
        .getByLabel("Material for whole job (ml)", { exact: true })
        .inputValue(),
      "",
      "Density changes must clear an imported conversion",
    );
    assert.ok(
      await page
        .getByRole("button", { name: "Save estimate with model" })
        .isDisabled(),
    );
    await page
      .getByRole("button", { name: "Use selected G-code file", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector('.cost-result input[type="number"]').value ===
        "2",
    );
    assert.equal(
      await page
        .getByLabel("Material for whole job (ml)", { exact: true })
        .inputValue(),
      "50",
    );
    await page
      .getByRole("button", { name: "Save estimate with model" })
      .click();
    await page
      .getByText(
        "Estimate saved with this model and its profile assumptions.",
        { exact: true },
      )
      .waitFor();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Estimate printing cost", exact: true })
      .click();
    await page
      .getByText("Loaded the last saved estimate for this file.", {
        exact: true,
      })
      .waitFor();
    await page.getByLabel("Material density (g/ml)", { exact: true }).fill("4");
    assert.equal(
      await page
        .getByLabel("Material for whole job (ml)", { exact: true })
        .inputValue(),
      "",
    );
    await page
      .getByLabel("Material for whole job (ml)", { exact: true })
      .fill("30");
    await page.getByLabel("Material density (g/ml)", { exact: true }).fill("3");
    assert.equal(
      await page
        .getByLabel("Material for whole job (ml)", { exact: true })
        .inputValue(),
      "30",
      "Manual quantities are preserved",
    );
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.evaluate(async () => {
      const file = (await window.scout.query({ search: "test.gcode" })).rows[0];
      const saved = await window.scout.costEstimate(file.id);
      await window.scout.saveCostEstimate(
        file.id,
        saved.profile,
        saved.inputs,
        "Imported: old.gcode",
      );
    });
    await page
      .getByRole("button", { name: "Estimate printing cost", exact: true })
      .click();
    await page.getByText("Older imported estimate", { exact: false }).waitFor();
    assert.equal(
      await page
        .getByLabel("Material for whole job (ml)", { exact: true })
        .inputValue(),
      "",
    );
    const volumeGcode = path.join(root, "volume.gcode");
    await fs.writeFile(volumeGcode, ";TIME:3600\n;filament used [cm3] = 80\n");
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, volumeGcode);
    await page
      .getByLabel("Technology", { exact: true })
      .selectOption("filament");
    await page.getByLabel("Material density (g/ml)", { exact: true }).fill("2");
    await page
      .getByRole("button", { name: "Read estimates from G-code…", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll('.cost-result input[type="number"]')[1]
          .value === "160",
    );
    assert.equal(
      await page
        .getByLabel("Material for whole job (g)", { exact: true })
        .inputValue(),
      "160",
    );
    await page.getByLabel("Material density (g/ml)", { exact: true }).fill("3");
    assert.equal(
      await page
        .getByLabel("Material for whole job (g)", { exact: true })
        .inputValue(),
      "",
    );
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByLabel("Search found files").fill("fLeX");
    await page.getByText("1 results", { exact: true }).waitFor();
    await page
      .locator("tbody .filename")
      .filter({ hasText: "Flex Dragon.scad" })
      .waitFor();
    assert.equal(await page.locator("tbody .filename").count(), 1);
    await page
      .getByText("25 matching folders and archives", { exact: true })
      .waitFor();
    await app.evaluate(({ shell }) => {
      global.scoutLocations = [];
      shell.openPath = async (file) => {
        global.scoutLocations.push({ kind: "folder", file });
        return "";
      };
      shell.showItemInFolder = (file) =>
        global.scoutLocations.push({ kind: "archive", file });
    });
    await page
      .getByRole("button", { name: "Open folder Flex animals", exact: true })
      .click();
    await page.getByLabel("Search found files").fill('"Flex pack"');
    await page
      .getByRole("button", { name: "Show archive Flex pack.zip", exact: true })
      .click();
    assert.deepEqual(await app.evaluate(() => global.scoutLocations), [
      { kind: "folder", file: path.join(source, "Flex animals") },
      { kind: "archive", file: path.join(source, "Flex pack.zip") },
    ]);
    await page.getByLabel("Search found files").fill("Flex");
    await page
      .getByText("25 matching folders and archives", { exact: true })
      .waitFor();
    assert.equal(await page.locator(".location-matches li").count(), 20);
    await page
      .getByRole("button", { name: "Next locations", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelectorAll(".location-matches li").length === 5,
    );
    await page
      .getByRole("button", { name: "Previous locations", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelectorAll(".location-matches li").length === 20,
    );
    await page.locator(".location-matches").evaluate((el) => {
      el.scrollTop = 0;
    });
    await fs.mkdir("artifacts", { recursive: true });
    await page.screenshot({ path: "artifacts/search-names.png" });
    await page
      .getByRole("button", { name: "Save search", exact: true })
      .click();
    await page.getByLabel("Search name").fill("Flex names");
    await page.getByRole("button", { name: "Save search preset" }).click();
    await page.getByLabel("Search in", { exact: true }).selectOption("path");
    await page.getByText("163 results", { exact: true }).waitFor();
    await page
      .getByLabel("Results per page", { exact: true })
      .selectOption("24");
    await page.waitForFunction(
      () => document.querySelectorAll("tbody tr").length === 24,
    );
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await page.getByText("25–48 of 163", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Previous page", exact: true })
      .click();
    await page.getByText("1–24 of 163", { exact: true }).waitFor();
    await page
      .getByLabel("Results per page", { exact: true })
      .selectOption("150");
    await page.getByRole("button", { name: "Flex names", exact: true }).click();
    await page.getByText("1 results", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Select all results", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelector('[aria-label="Select this page"]').checked,
    );
    assert.equal(
      await page.getByLabel("Select this page", { exact: true }).isChecked(),
      true,
    );
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    assert.equal(
      await page.getByLabel("Search in", { exact: true }).inputValue(),
      "name",
    );
    const csv = path.join(root, "matches.csv");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, csv);
    await page
      .getByRole("button", { name: "Export list", exact: true })
      .click();
    await page
      .getByText("Inventory exported to " + csv, { exact: true })
      .waitFor();
    const exported = await fs.readFile(csv, "utf8");
    assert.ok(exported.includes("Flex Dragon.scad"));
    assert.ok(!exported.includes("ordinary.scad"));
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    await page.getByText("163 results", { exact: true }).waitFor();
    await page.getByLabel("File type filter").selectOption("gcode");
    await page.getByText("1 results", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    await page.getByText("163 results", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Gallery view", exact: true })
      .click();
    await page.getByRole("button", { name: "List view", exact: true }).click();
    await page.keyboard.press("Control+f");
    assert.ok(
      await page
        .getByLabel("Search found files")
        .evaluate((el) => el === document.activeElement),
    );
    // Test fast completion repeatedly with an inventory that has no size candidates.
    const zero = path.join(root, "zero");
    await fs.mkdir(zero);
    await fs.writeFile(path.join(zero, "one.scad"), "cube(1);");
    await fs.writeFile(path.join(zero, "two.scad"), "sphere(20);");
    await page
      .getByRole("button", { name: "Remove " + source, exact: true })
      .click();
    await page.getByLabel("Folder or drive path").fill(zero);
    await page.getByRole("button", { name: "Add typed path" }).click();
    await page
      .getByRole("button", { name: "Search locations", exact: true })
      .click();
    await page.getByText("2 files discovered", { exact: false }).waitFor();
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        window.completed = false;
        window.scout.onProgress((p) => {
          if (p.phase === "complete" && p.total === 0) window.completed = true;
        });
      });
      await page
        .getByRole("button", { name: "Check duplicates", exact: true })
        .click();
      await page.waitForFunction(() => window.completed);
      await page.waitForFunction(() =>
        [...document.querySelectorAll("button")].some(
          (b) => b.textContent.trim() === "Check duplicates" && !b.disabled,
        ),
      );
    }
    await page.evaluate(
      (p) => window.scout.scan({ roots: [p] }),
      path.join(root, "missing"),
    );
    await page.getByText("Scan failed", { exact: true }).waitFor();
    assert.deepEqual(
      (await page.evaluate(() => window.scout.info())).lastScan.roots,
      [zero],
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Remove " + zero, exact: true })
      .waitFor();
    await page.getByText("2 files discovered", { exact: false }).waitFor();
    assert.equal((await page.evaluate(() => window.scout.query({}))).count, 2);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.isVisible())
        .setSize(1000, 680),
    );
    await page.getByLabel("Search found files").fill("one");
    await page.getByText("1 results", { exact: true }).waitFor();
    await page.screenshot({ path: "artifacts/reliability-minimum.png" });
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        ok: true,
        steps: [
          "conversion review and saved provenance",
          "manual quantities",
          "filename-only case-insensitive search",
          "separate paged containers",
          "saved scope",
          "filtered CSV",
          "format filter",
          "gallery/list",
          "search shortcut",
          "zero-candidate completion",
          "failed scan and reload",
          "minimum window",
        ],
        root,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
