const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { fixture, STL } = require("./helpers.cjs");
(async () => {
  const root = await fixture("geometry-ui"),
    source = path.join(root, "models");
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, "original.stl"), STL);
  await fs.writeFile(
    path.join(source, "other-export.obj"),
    "v 0 0 0\nv 0 20 0\nv 20 0 0\nv 0 0 20\nf 1 2 3\nf 1 3 4\nf 1 4 2\nf 3 2 4\n",
  );
  await fs.writeFile(
    path.join(source, "scaled.stl"),
    STL.replaceAll("20", "30"),
  );
  await fs.writeFile(
    path.join(source, "ply-export.ply"),
    "ply\nformat ascii 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nelement face 4\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n0 20 0\n20 0 0\n0 0 20\n3 0 1 2\n3 0 2 3\n3 0 3 1\n3 2 1 3\n",
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
    await page.getByText("4 files discovered").waitFor();
    await page
      .getByRole("button", { name: "Matching geometry", exact: true })
      .click();
    const dialog = page.locator("dialog[open]");
    await dialog
      .getByRole("button", { name: "Compare geometry", exact: true })
      .click();
    await dialog
      .getByText("1 matching geometry group", { exact: true })
      .waitFor({ timeout: 45000 });
    await dialog
      .getByRole("button", { name: "Preview left", exact: true })
      .first()
      .click();
    await dialog
      .getByRole("button", { name: "Preview right", exact: true })
      .nth(1)
      .click();
    await page.waitForFunction(
      () =>
        [
          ...document.querySelectorAll(".geometry-previews .preview-wrap"),
        ].filter((p) => p.dataset.readyFile).length === 2,
    );
    await fs.mkdir("artifacts", { recursive: true });
    await page.screenshot({ path: "artifacts/geometry-comparison.png" });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.isVisible())
        .setSize(1000, 680),
    );
    await dialog
      .getByRole("button", { name: "Review selected transfers" })
      .scrollIntoViewIfNeeded();
    const bounds = await dialog.boundingBox();
    const viewport =
      page.viewportSize() ||
      (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })));
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1);
    await page.screenshot({ path: "artifacts/geometry-minimum.png" });
    await dialog
      .getByRole("button", { name: "Compare geometry", exact: true })
      .click();
    await dialog.getByRole("status").filter({ hasText: "4 reused" }).waitFor();
    await dialog
      .getByLabel("Select candidate original.stl", { exact: true })
      .check();
    await dialog
      .getByLabel("Select candidate other-export.obj", { exact: true })
      .check();
    await dialog
      .getByLabel("Select candidate ply-export.ply", { exact: true })
      .check();
    assert.ok(
      await dialog
        .getByRole("button", { name: "Review selected transfers" })
        .isDisabled(),
    );
    await dialog
      .getByLabel("Select candidate original.stl", { exact: true })
      .uncheck();
    await dialog
      .getByLabel("Select candidate ply-export.ply", { exact: true })
      .uncheck();
    await dialog
      .getByRole("button", { name: "Review selected transfers" })
      .click();
    await dialog
      .getByRole("heading", { name: "Organize selected files" })
      .waitFor();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal((await fs.readdir(source)).length, 4);
    // Twenty-one groups exercise keeper validation after leaving a selected group page.
    for (let i = 0; i < 20; i++) {
      for (const suffix of ["a", "b"])
        await fs.writeFile(
          path.join(source, `pair-${i}-${suffix}.stl`),
          STL.replaceAll("20", String(40 + i)),
        );
    }
    await page
      .getByRole("button", { name: "Search locations", exact: true })
      .click();
    await page.getByText("44 files discovered").waitFor();
    await page
      .getByRole("button", { name: "Matching geometry", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Compare geometry", exact: true })
      .click();
    await dialog
      .getByText("21 matching geometry groups", { exact: true })
      .waitFor({ timeout: 45000 });
    const firstPair = dialog
      .locator(".geometry-groups section")
      .first()
      .getByRole("checkbox");
    await firstPair.nth(0).check();
    await firstPair.nth(1).check();
    await firstPair.nth(2).check();
    await dialog
      .getByRole("button", { name: "Next groups", exact: true })
      .click();
    await dialog.getByText("Page 2 / 2", { exact: true }).waitFor();
    assert.ok(
      await dialog
        .getByRole("button", { name: "Review selected transfers" })
        .isDisabled(),
    );
    await dialog
      .getByRole("button", { name: "Previous groups", exact: true })
      .click();
    await dialog.getByText("Page 1 / 2", { exact: true }).waitFor();
    assert.ok(await firstPair.nth(0).isChecked());
    await dialog.getByRole("button", { name: "Close dialog" }).click();
    // Add unique pairs beyond fifty exact groups to check keeper choices survive pagination.
    for (let i = 0; i < 31; i++) {
      for (const suffix of ["a", "b"])
        await fs.writeFile(
          path.join(source, `script-${i}-${suffix}.scad`),
          `cube(${i + 1});`,
        );
    }
    await page
      .getByRole("button", { name: "Search locations", exact: true })
      .click();
    await page.getByText("106 files discovered").waitFor();
    await page
      .getByRole("button", { name: "Check duplicates", exact: true })
      .click();
    await page.waitForFunction(
      async () => (await window.scout.stats()).duplicateGroups === 51,
    );
    await page
      .getByRole("button", { name: "Review copies", exact: true })
      .click();
    const keeper = dialog
      .locator(".duplicate-group")
      .first()
      .getByRole("radio")
      .nth(1);
    await keeper.check();
    await dialog.getByRole("button", { name: "Next duplicate groups" }).click();
    await dialog.getByText("Groups 51–51 of 51", { exact: false }).waitFor();
    await dialog
      .getByRole("button", { name: "Previous duplicate groups" })
      .click();
    await dialog.getByText("Groups 1–50 of 51", { exact: false }).waitFor();
    assert.ok(await keeper.isChecked());
    assert.equal((await fs.readdir(source)).length, 106);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        ok: true,
        packaged: !!process.env.SCOUT_PACKAGED,
        checks: [
          "cross-format candidates",
          "paired preview",
          "cache reuse",
          "explicit candidate selection",
          "keeper protection",
          "minimum window layout",
          "geometry keeper protection across pages",
          "exact duplicate keeper choices across pages",
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
