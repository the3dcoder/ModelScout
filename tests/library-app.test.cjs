const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { fixture, STL } = require("./helpers.cjs");
(async () => {
  const root = await fixture("library");
  const source = path.join(root, "models");
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, "dragon.stl"), STL);
  await fs.writeFile(path.join(source, "bracket.stl"), STL);
  await fs.writeFile(path.join(source, "broken.stl"), "broken data");
  await fs.writeFile(path.join(source, "design.scad"), "cube(10);");
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
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.getByLabel("Folder or drive path").fill(source);
    await page.getByRole("button", { name: "Add typed path" }).click();
    await page
      .getByRole("button", { name: "Search locations", exact: true })
      .click();
    await page.getByText("4 files discovered").waitFor();
    await page
      .getByRole("button", { name: "Gallery view", exact: true })
      .click();
    await page
      .getByAltText("3D preview of dragon.stl")
      .waitFor({ timeout: 65000 });
    await page.getByAltText("3D preview of bracket.stl").waitFor();
    await page.getByText("Preview unavailable", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Prepare this page", exact: true })
      .click();
    await page.evaluate(() => {
      window.retriedPreview = false;
      window.scout.onThumbnail((data) => {
        if (data.error) window.retriedPreview = true;
      });
    });
    await page
      .locator(".model-card")
      .filter({ hasText: "broken.stl" })
      .getByRole("button", { name: "Retry preview", exact: true })
      .click();
    await page.waitForFunction(() => window.retriedPreview);
    await page.getByText("Preview unavailable", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Favorite dragon.stl", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Inspect dragon.stl", exact: true })
      .click();
    await page.getByLabel("Model tags").fill("Miniature, DND");
    await page.getByRole("button", { name: "Save tags", exact: true }).click();
    await page.getByText("Library details saved locally.").waitFor();
    await page
      .getByRole("button", { name: "Tag filters", exact: true })
      .click();
    await page
      .getByLabel("Include tag", { exact: true })
      .selectOption("miniature");
    await page.getByText("1 results", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Save search", exact: true })
      .click();
    await page.getByLabel("Search name").fill("My minis");
    await page.getByRole("button", { name: "Save search preset" }).click();
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    await page.getByText("4 results", { exact: true }).waitFor();
    await page.getByRole("button", { name: "My minis", exact: true }).click();
    await page.getByText("1 results", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Search locations", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Search locations", exact: true })
      .waitFor();
    const rows = await page.evaluate(() =>
      window.scout.query({ search: "dragon" }),
    );
    assert.equal(rows.rows[0].favorite, 1);
    assert.deepEqual(rows.rows[0].tags, ["miniature", "dnd"]);
    assert.equal(rows.rows[0].hasThumbnail, 1);
    assert.ok(rows.rows[0].analysis);
    await page.screenshot({ path: "artifacts/gallery-fixture.png" });
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        ok: true,
        steps: [
          "static gallery",
          "thumbnail failure state",
          "favorites",
          "tags",
          "tag filters",
          "saved search",
          "cache across rescan",
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
