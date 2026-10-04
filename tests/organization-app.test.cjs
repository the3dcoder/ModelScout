const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { fixture, STL } = require("./helpers.cjs");
(async () => {
  const root = await fixture("organization-ui"),
    source = path.join(root, "models"),
    dest = path.join(root, "organized");
  await fs.mkdir(source);
  await fs.mkdir(dest);
  await fs.writeFile(path.join(source, "support.stl"), STL);
  await fs.writeFile(
    path.join(source, "vase.obj"),
    "mtllib vase.mtl\nv 0 0 0\nv 20 0 0\nv 0 20 0\nf 1 2 3\n",
  );
  await fs.writeFile(
    path.join(source, "vase.mtl"),
    "newmtl finish\nmap_Kd finish.png\n",
  );
  await fs.writeFile(path.join(source, "finish.png"), "texture");
  const env = { ...process.env, SCOUT_TEST_DATA: path.join(root, "profile") };
  delete env.ELECTRON_RUN_AS_NODE;
  const options = process.env.SCOUT_PACKAGED
    ? {
        executablePath: path.resolve(
          `release/${require("../package.json").version}/win-unpacked/Model Scout.exe`,
        ),
        args: [],
        env,
      }
    : { args: [path.resolve(".")], env };
  const app = await electron.launch(options);
  try {
    const page = await app.firstWindow(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.getByLabel("Folder or drive path").fill(source);
    await page.getByRole("button", { name: "Add typed path" }).click();
    await page
      .getByRole("button", { name: "Search locations", exact: true })
      .click();
    await page.getByText("2 files discovered").waitFor();
    await page
      .getByRole("button", { name: "Select all results", exact: true })
      .click();
    await page.getByRole("button", { name: "Collection", exact: true }).click();
    const dialog = page.locator("dialog[open]");
    await dialog.getByLabel("Name", { exact: true }).fill("Desk set");
    await dialog
      .getByLabel("Creator", { exact: true })
      .fill("Example workshop");
    await dialog
      .getByLabel("License / usage notes")
      .fill("Original test geometry");
    await dialog.getByLabel("Source link").fill("https://example.org/desk-set");
    await dialog
      .getByLabel("Project notes")
      .fill("Keep the vase and support together.");
    await dialog.getByRole("button", { name: "Save and add selected" }).click();
    await page
      .locator(".collection-summary")
      .getByText("Desk set", { exact: true })
      .waitFor();
    const collection = await page.evaluate(
      async () => (await window.scout.stats()).collections[0],
    );
    assert.equal(collection.available, 2);
    await page
      .getByRole("button", { name: "Gallery view", exact: true })
      .click();
    await page
      .getByAltText("3D preview of support.stl")
      .waitFor({ timeout: 65000 });
    await fs.mkdir("artifacts", { recursive: true });
    await page.screenshot({ path: "artifacts/collections-ui.png" });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.isVisible())
        .setSize(1000, 680),
    );
    await page.waitForFunction(() => window.innerWidth <= 1000);
    await page.screenshot({ path: "artifacts/collections-minimum.png" });
    console.log(
      "minimum gallery height",
      await page.locator(".gallery").evaluate((e) => e.clientHeight),
    );
    assert.ok(
      await page.locator(".gallery").evaluate((e) => e.clientHeight >= 150),
      "Gallery remains usable at the minimum window size",
    );
    const actionBounds = await page
      .getByRole("button", { name: "Copy / move selected" })
      .boundingBox();
    assert.ok(
      actionBounds.x + actionBounds.width <=
        (await page.evaluate(() => window.innerWidth)),
    );
    await page.screenshot({ path: "artifacts/collections-minimum.png" });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.isVisible())
        .setSize(1510, 950),
    );
    await page.waitForFunction(() => window.innerWidth > 1400);
    assert.ok(
      await page.locator(".gallery").evaluate((e) => e.clientHeight > 200),
    );
    await page.getByRole("button", { name: "Copy / move selected" }).click();
    await dialog.getByLabel("Destination folder").fill(dest);
    await dialog.getByRole("button", { name: "Review 2 files" }).click();
    await dialog.getByText("4 files ·", { exact: false }).waitFor();
    assert.equal(
      await dialog.getByText("referenced asset", { exact: false }).count(),
      2,
    );
    await dialog
      .getByRole("button", { name: "Confirm copy of 4 files" })
      .click();
    await dialog.getByText("4 of 4 completed", { exact: true }).waitFor();
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    assert.ok((await fs.stat(path.join(source, "vase.obj"))).isFile());
    await page
      .getByRole("button", { name: "Search locations", exact: true })
      .click();
    await page.getByText("2 files discovered").waitFor();
    await page
      .locator(".collection-summary")
      .getByText("2 available", { exact: false })
      .waitFor();
    if (process.env.SCOUT_RETAIN_FIXTURES !== "1") {
      await page
        .getByRole("button", { name: "Edit collection", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Remove collection", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Confirm removal of collection only" })
        .click();
    }
    assert.equal((await page.evaluate(() => window.scout.stats())).total, 2);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        ok: true,
        packaged: !!process.env.SCOUT_PACKAGED,
        checks: [
          "collections",
          "gallery layout",
          "referenced assets",
          "verified copy",
          "rescan",
          process.env.SCOUT_RETAIN_FIXTURES === "1"
            ? "collection retained; removal omitted"
            : "collection removal",
        ],
      }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
