const fs = require("node:fs/promises");
const path = require("node:path");
const { dialog } = require("electron");
const { readRow } = require("./files.cjs");
module.exports = function registerCosts({ handle, catalog, win, row }) {
  // This pure calculation module is also used by the live calculator in the renderer.
  const logic = () => import("../src/costing.mjs");
  handle("costProfiles", () => catalog.setting("costProfiles") || []);
  handle("saveCostProfile", async (input) => {
    const { validateProfile } = await logic();
    const profile = validateProfile(input);
    const profiles = (catalog.setting("costProfiles") || []).filter(
      (p) => p.name !== profile.name,
    );
    if (profiles.length >= 50)
      throw new Error(
        "Keep up to 50 profiles. Reuse a profile name to update it.",
      );
    profiles.push(profile);
    catalog.setting("costProfiles", profiles);
    return profiles;
  });
  handle("exportCostProfile", async (input) => {
    const { validateProfile } = await logic();
    const profile = validateProfile(input);
    const result = await dialog.showSaveDialog(win, {
      title: "Export cost profile",
      defaultPath: "model-scout-cost-profile.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled) return null;
    await fs.writeFile(
      result.filePath,
      JSON.stringify(
        { format: "model-scout-cost-profile", version: 1, profile },
        null,
        2,
      ),
    );
    return result.filePath;
  });
  handle("importGcodeCost", async (id) => {
    let text, source;
    if (id) {
      const r = row(id);
      if (!["gcode", "g", "gco"].includes(r.ext))
        throw new Error("Select a text G-code file.");
      text = (await readRow(r)).toString("utf8");
      source = r.name;
    } else {
      const result = await dialog.showOpenDialog(win, {
        title: "Read slicer estimates from G-code",
        properties: ["openFile"],
        filters: [{ name: "Text G-code", extensions: ["gcode", "g", "gco"] }],
      });
      if (result.canceled) return null;
      const file = result.filePaths[0],
        stat = await fs.stat(file),
        h = await fs.open(file, "r");
      try {
        const length = Math.min(stat.size, 256 * 1024),
          head = Buffer.alloc(length),
          tail = Buffer.alloc(length);
        const first = await h.read(head, 0, length, 0);
        const last =
          stat.size > length
            ? await h.read(tail, 0, length, stat.size - length)
            : { bytesRead: 0 };
        text =
          head.subarray(0, first.bytesRead).toString("utf8") +
          "\n" +
          tail.subarray(0, last.bytesRead).toString("utf8");
        source = path.basename(file);
      } finally {
        await h.close();
      }
    }
    const { parseGcodeEstimates } = await logic();
    return { ...parseGcodeEstimates(text), source };
  });
  handle("saveCostEstimate", async (id, profile, inputs, source) => {
    const r = row(id);
    const { estimateCost, validateProfile } = await logic();
    const result = estimateCost(profile, inputs);
    const value = {
      profile: validateProfile(profile),
      inputs: {
        hours: Number(inputs.hours),
        amount: Number(inputs.amount),
        parts: Number(inputs.parts),
      },
      source: String(source).slice(0, 300),
      result,
      date: new Date().toISOString(),
      fileVersion: r.version,
    };
    catalog.setting("cost:" + id, value);
    return value;
  });
  handle("costEstimate", (id) => {
    row(id);
    return catalog.setting("cost:" + id);
  });
};
