const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { fixture, STL, zip } = require("./helpers.cjs");
(async () => {
  const root = await fixture("app"),
    source = path.join(root, "models"),
    dest = path.join(root, "organized");
  await fs.mkdir(source);
  await fs.mkdir(dest);
  await fs.writeFile(path.join(source, "bracket.stl"), STL);
  await fs.writeFile(path.join(source, "bracket-copy.stl"), STL);
  await fs.writeFile(
    path.join(source, "variant.stl"),
    STL.replaceAll("20", "30"),
  );
  await fs.writeFile(path.join(source, "source.scad"), "cube([1,2,3]);");
  await fs.writeFile(
    path.join(source, "pack.zip"),
    zip({ "archived.stl": STL }),
  );
  const env = { ...process.env, SCOUT_TEST_DATA: path.join(root, "data") };
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
    await page.waitForLoadState("domcontentloaded");
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.getByLabel("Folder or drive path").fill(source);
    await page.getByRole("button", { name: "Add typed path" }).click();
    await page
      .getByRole("button", { name: "Search locations", exact: true })
      .click();
    await page.getByText("4 files discovered").waitFor({ timeout: 30000 });
    await page
      .getByRole("button", { name: "bracket.stl", exact: false })
      .filter({ has: page.locator("strong", { hasText: /^bracket\.stl$/ }) })
      .click();
    await page
      .getByText("Bounding box", { exact: true })
      .waitFor({ timeout: 30000 });
    assert.equal(
      await page.getByText("20 × 20 × 20", { exact: true }).count(),
      1,
    );
    await page.getByLabel("Your category").fill("Reviewed hardware");
    await page
      .getByLabel("Notes", { exact: true })
      .fill("Known calibration fixture");
    await page.getByRole("button", { name: "Save category & notes" }).click();
    await page.getByText("Category and notes saved locally.").waitFor();
    await app.evaluate(() => {
      global.scoutTestRequests = [];
      global.fetch = async (url, options) => {
        global.scoutTestRequests.push({ url, body: JSON.parse(options.body) });
        return new Response(
          JSON.stringify({
            output: [
              {
                content: [
                  {
                    type: "output_text",
                    text: "Test-only vision result: tetrahedron; intended purpose unknown.",
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      };
    });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByLabel("OpenAI API key").fill("test-key-not-real");
    await page.getByRole("button", { name: "Save for this session" }).click();
    await page.getByRole("button", { name: "Identify from preview" }).click();
    assert.equal(
      (await app.evaluate(() => global.scoutTestRequests)).length,
      0,
    );
    await page
      .getByRole("button", { name: "Send preview for identification" })
      .click();
    await page
      .getByText("Test-only vision result:", { exact: false })
      .waitFor();
    const requests = await app.evaluate(() => global.scoutTestRequests);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.openai.com/v1/responses");
    assert.ok(!JSON.stringify(requests[0].body).includes(source));
    assert.ok(!JSON.stringify(requests[0].body).includes("bracket.stl"));
    await page
      .getByRole("button", { name: "Check duplicates", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Review copies", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Review copies", exact: true })
      .click();
    await page.getByText("2 identical copies", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Queue extras for review folder" })
      .click();
    await page.getByLabel("Destination folder").fill(dest);
    await page
      .getByRole("button", { name: "Review 1 files", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirm move of 1 files" }).click();
    await page.getByText("1 of 1 completed", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    const remaining = (await fs.readdir(source)).filter(
      (n) => n === "bracket.stl" || n === "bracket-copy.stl",
    );
    assert.equal(remaining.length, 1);
    assert.equal(await page.locator("dialog[open]").count(), 0);
    await page.getByLabel("Look inside archives").check();
    await page
      .getByRole("button", { name: "Search locations", exact: true })
      .click();
    await page.getByText("4 files discovered").waitFor();
    await page.getByLabel("Search found files").fill("archived.stl");
    await page.locator("tbody tr").first().waitFor();
    await page.getByRole("button", { name: /archived\.stl/ }).click();
    await page.getByText("Bounding box", { exact: true }).waitFor();
    await fs.mkdir("artifacts", { recursive: true });
    await page.screenshot({ path: "artifacts/app-fixture.png" });
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        ok: true,
        steps: [
          "scan",
          "preview",
          "category notes",
          "mocked AI consent and payload",
          "duplicate keeper review",
          "verified move",
          "archive opt-in",
          "archive preview",
        ],
        errors,
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
