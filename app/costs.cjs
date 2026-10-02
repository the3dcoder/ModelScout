const fs = require("node:fs/promises");
const path = require("node:path");
const { dialog } = require("electron");
const { readEstimatesText } = require("./gcode.cjs");
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
      text = await readEstimatesText(r);
      source = r.name;
    } else {
      const result = await dialog.showOpenDialog(win, {
        title: "Read slicer estimates from G-code",
        properties: ["openFile"],
        filters: [{ name: "Text G-code", extensions: ["gcode", "g", "gco"] }],
      });
      if (result.canceled) return null;
      const file = result.filePaths[0],
        stat = await fs.lstat(file);
      if (![".gcode", ".g", ".gco"].includes(path.extname(file).toLowerCase()))
        throw new Error("Select a text G-code file.");
      text = await readEstimatesText({
        path: file,
        member: "",
        size: stat.size,
        mtime: stat.mtimeMs,
        ctime: stat.ctimeMs,
      });
      source = path.basename(file);
    }
    const { parseGcodeEstimates } = await logic();
    return { ...parseGcodeEstimates(text), source };
  });
  handle(
    "saveCostEstimate",
    async (id, profile, inputs, source, materialSource) => {
      const r = row(id);
      const { estimateCost, validateProfile } = await logic();
      const result = estimateCost(profile, inputs);
      let provenance = null;
      if (materialSource) {
        const { sourceUnit, unit } = materialSource;
        const sourceAmount = Number(materialSource.sourceAmount),
          density = Number(materialSource.density);
        const converted = sourceUnit !== unit;
        if (
          !["g", "ml"].includes(sourceUnit) ||
          unit !== profile.materialUnit ||
          !Number.isFinite(sourceAmount) ||
          sourceAmount < 0 ||
          (converted &&
            (!Number.isFinite(density) ||
              density <= 0 ||
              density !== Number(profile.density)))
        )
          throw new Error(
            "Review the imported material quantity and density before saving.",
          );
        const expected = !converted
          ? sourceAmount
          : unit === "g"
            ? sourceAmount * density
            : sourceAmount / density;
        if (Math.abs(Number(inputs.amount) - expected) > 0.000051)
          throw new Error(
            "Imported material quantity changed. Enter it manually or reimport.",
          );
        provenance = {
          source: String(materialSource.source).slice(0, 300),
          sourceUnit,
          sourceAmount,
          unit,
          density: converted ? density : null,
        };
      }
      const value = {
        profile: validateProfile(profile),
        inputs: {
          hours: Number(inputs.hours),
          amount: Number(inputs.amount),
          parts: Number(inputs.parts),
        },
        source: String(source).slice(0, 300),
        materialSource: provenance,
        result,
        date: new Date().toISOString(),
        fileVersion: r.version,
      };
      catalog.setting("cost:" + id, value);
      return value;
    },
  );
  handle("costEstimate", (id) => {
    row(id);
    return catalog.setting("cost:" + id);
  });
};
