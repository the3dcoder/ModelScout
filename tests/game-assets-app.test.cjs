const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { fixture, zip } = require("./helpers.cjs");
(async () => {
  const root = await fixture("game-desktop"),
    source = path.join(root, "assets"),
    out = path.join(root, "output");
  await fs.mkdir(source);
  await fs.mkdir(out);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=",
    "base64",
  );
  for (let i = 0; i < 160; i++)
    await fs.writeFile(path.join(source, `sprite-${i}.png`), png);
  await fs.writeFile(path.join(source, "music.ogg"), "audio fixture");
  await fs.writeFile(
    path.join(source, "map.tmx"),
    '<map><tileset source="sheet.tsx"/></map>',
  );
  await fs.writeFile(path.join(source, "LICENSE"), "fixture license");
  await fs.writeFile(path.join(source, "unknown.custom"), "unknown fixture");
  await fs.writeFile(path.join(source, "pack.zip"), zip({ "hidden.png": png }));
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
    if (process.env.SCOUT_TEST_CPU_RATE) {
      const session = await page.context().newCDPSession(page);
      await session.send("Emulation.setCPUThrottlingRate", {
        rate: Number(process.env.SCOUT_TEST_CPU_RATE),
      });
    }
    page.on("pageerror", (e) => errors.push(e.message));
    await page.evaluate(() => {
      window.__scoutProgressTrace = [];
      window.scout.onProgress((state) => {
        window.__scoutProgressTrace.push(state);
        if (window.__scoutProgressTrace.length > 20)
          window.__scoutProgressTrace.shift();
      });
    });
    await page.getByLabel("Scan mode", { exact: true }).selectOption("game");
    await page.getByLabel("Folder or drive path").fill(source);
    await page
      .getByRole("button", { name: "Add typed path", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Search locations", exact: true })
      .click();
    await page.getByText("165 files discovered", { exact: false }).waitFor();
    await page.getByLabel("File family", { exact: true }).selectOption("Audio");
    await page.getByText("1 results", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    await page.getByLabel("File type filter").selectOption("(none)");
    await page.getByText("1 results", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    await page.getByLabel("Search found files").fill("sprite-1.png");
    await page.getByText("1 results", { exact: true }).waitFor();
    await page.getByText("sprite-1.png", { exact: true }).click();
    await page.getByAltText("Image preview of sprite-1.png").waitFor();
    await page.waitForFunction(() => {
      const img = document.querySelector(".raster-preview img");
      return img?.complete && img.naturalWidth > 0;
    });
    assert.equal(
      await page
        .getByRole("button", { name: "Estimate printing cost", exact: true })
        .count(),
      0,
    );
    await page
      .getByRole("button", { name: "Gallery view", exact: true })
      .click();
    await page.locator(".model-card .raster-preview img").waitFor();
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Create asset library", exact: true })
      .click();
    await page.getByLabel("Asset library parent folder").fill(out);
    await page
      .getByRole("button", {
        name: "Prepare unique asset library",
        exact: true,
      })
      .click();
    await page
      .getByRole("heading", {
        name: "Review the new organization",
        exact: true,
      })
      .waitFor();
    await page.getByText("6 unique files", { exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("button", {
          name: "Copy unique assets to new library",
          exact: true,
        })
        .isDisabled(),
      true,
    );
    const library = (await fs.readdir(out))[0],
      directory = path.join(out, library);
    const summary = JSON.parse(
      await fs.readFile(path.join(directory, "summary.json"), "utf8"),
    );
    assert.equal(summary.files, 165);
    assert.equal(summary.uniqueFiles, 6);
    assert.equal(summary.duplicateCopies, 159);
    await page.screenshot({
      path: path.resolve("artifacts/game-library-review.png"),
    });
    await page.getByLabel("Review unique asset copy").check();
    await page
      .getByRole("button", {
        name: "Copy unique assets to new library",
        exact: true,
      })
      .click();
    await page.getByText(/Copy complete: 6 verified copies/).waitFor();
    const receipt = JSON.parse(
      await fs.readFile(path.join(directory, "copy-receipt.json"), "utf8"),
    );
    assert.equal(receipt.copied, 6);
    assert.equal((await fs.readdir(source)).length, 165);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Unique files", exact: true })
      .click();
    await page.getByText("6 results", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Create asset library", exact: true })
      .click();
    await page.getByLabel("Asset catalog scope").selectOption("filtered");
    await page
      .getByText(/Unique files view is expanded for preparation/)
      .waitFor();
    await page.getByLabel("Asset library parent folder").fill(out);
    await page
      .getByRole("button", {
        name: "Prepare unique asset library",
        exact: true,
      })
      .click();
    await page.getByText("6 unique files", { exact: true }).waitFor();
    const filteredLibrary = (await fs.readdir(out)).find(
      (name) => name !== library,
    );
    const filteredSummary = JSON.parse(
      await fs.readFile(
        path.join(out, filteredLibrary, "summary.json"),
        "utf8",
      ),
    );
    assert.equal(filteredSummary.files, 165);
    assert.equal(filteredSummary.duplicateCopies, 159);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    const cancelled = await page.evaluate(async (destination) => {
      const prepare = window.scout.assetPrepare({}, destination);
      await window.scout.cancel();
      return await prepare;
    }, out);
    assert.equal(cancelled.summary.status, "cancelled");
    await page.getByLabel("Scan mode", { exact: true }).selectOption("models");
    await page.evaluate(async (source) => {
      const unsubscribe = window.scout.onProgress((state) => {
        if (state.running && state.mode === "models") {
          unsubscribe();
          window.scout.cancel();
        }
      });
      await window.scout.scan({ roots: [source], mode: "models" });
    }, source);
    await page.waitForFunction(
      async () =>
        (await window.scout.info()).lastScan?.restoredPrevious === true,
    );
    await page.getByLabel("File family", { exact: true }).waitFor();
    assert.equal(
      (await page.evaluate(() => window.scout.info())).lastScan.mode,
      "game",
    );
    await page.reload();
    await page.getByLabel("Scan mode", { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel("Scan mode", { exact: true }).inputValue(),
      "game",
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => !w.isDestroyed() && w.isVisible())
        .setSize(1000, 680),
    );
    await page.screenshot({
      path: path.resolve("artifacts/game-library-minimum.png"),
    });
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        checks: [
          "all-files game scan",
          "family and extensionless filters",
          "raster preview/gallery",
          "unique library review",
          "verified copy with duplicate exclusion",
          "source retention",
          "cancellation",
          "filtered unique preparation retains aliases",
          "cancelled mode change restores catalog",
          "persisted mode",
          "minimum window",
        ],
        root,
      }),
    );
  } catch (error) {
    const page = await app.firstWindow();
    console.error(
      JSON.stringify(
        await page.evaluate(async () => ({
          lastScan: (await window.scout.info()).lastScan,
          progress: window.__scoutProgressTrace,
          familyVisible: !!document.querySelector('[aria-label="File family"]'),
          dialogs: document.querySelectorAll("dialog[open]").length,
        })),
      ),
    );
    throw error;
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
