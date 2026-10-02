export const profileDefaults = {
  name: "New filament profile",
  technology: "filament",
  currency: "USD",
  printer: "",
  material: "",
  materialUnit: "g",
  packAmount: 1000,
  packPrice: 0,
  density: 1.24,
  printerPrice: 0,
  lifetimeHours: 5000,
  watts: 0,
  electricity: 0,
  maintenanceHourly: 0,
  laborHourly: 0,
  setupMinutes: 0,
  finishMinutesPerPart: 0,
  consumablesPerJob: 0,
  packagingPerPart: 0,
  wastePercent: 0,
  failurePercent: 0,
  marginPercent: 0,
  washCureMinutes: 0,
  washCureWatts: 0,
  washCureCost: 0,
};
export const numericFields = Object.keys(profileDefaults).filter(
  (k) => typeof profileDefaults[k] === "number",
);
export function validateProfile(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Choose a valid Model Scout cost profile.");
  const p = { ...profileDefaults };
  for (const k of ["name", "printer", "material"])
    p[k] = String(input[k] ?? p[k])
      .trim()
      .slice(0, 100);
  if (!p.name) throw new Error("Name this profile.");
  p.technology = input.technology ?? p.technology;
  if (!["filament", "resin"].includes(p.technology))
    throw new Error("Choose filament or resin.");
  p.materialUnit = input.materialUnit ?? p.materialUnit;
  if (!["g", "ml"].includes(p.materialUnit))
    throw new Error("Material units must be g or ml.");
  if (p.technology === "filament" && p.materialUnit !== "g")
    throw new Error("Use grams for filament estimates.");
  p.currency = String(input.currency ?? "USD")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(p.currency))
    throw new Error("Use a three-letter currency code, such as USD.");
  for (const k of numericFields) {
    const n = Number(input[k] ?? p[k]);
    if (!Number.isFinite(n) || n < 0 || n > 1e9)
      throw new Error(`Enter a valid non-negative value for ${k}.`);
    p[k] = n;
  }
  if (p.packAmount <= 0 || p.density <= 0 || p.lifetimeHours <= 0)
    throw new Error(
      "Pack amount, density, and machine lifetime must be above zero.",
    );
  if (p.failurePercent >= 100 || p.marginPercent >= 100 || p.wastePercent > 100)
    throw new Error(
      "Failure and margin must be below 100%; waste must be at most 100%.",
    );
  return p;
}
export function estimateCost(profile, input) {
  const p = validateProfile(profile);
  const hours = Number(input.hours),
    amount = Number(input.amount),
    parts = Number(input.parts);
  if (
    !Number.isFinite(hours) ||
    hours <= 0 ||
    hours > 100000 ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > 1e9 ||
    !Number.isInteger(parts) ||
    parts < 1 ||
    parts > 100000
  )
    throw new Error(
      "Enter positive print hours, material for the whole job, and a whole-number part count.",
    );
  const material = (amount * p.packPrice) / p.packAmount;
  const waste = (material * p.wastePercent) / 100;
  const electricity = ((hours * p.watts) / 1000) * p.electricity;
  const depreciation = (hours * p.printerPrice) / p.lifetimeHours;
  const maintenance = hours * p.maintenanceHourly;
  const setup = (p.setupMinutes / 60) * p.laborHourly;
  const consumables = p.consumablesPerJob;
  const attempt =
    material +
    waste +
    electricity +
    depreciation +
    maintenance +
    setup +
    consumables;
  const failure = attempt / (1 - p.failurePercent / 100) - attempt;
  const finishing = ((parts * p.finishMinutesPerPart) / 60) * p.laborHourly;
  const washCure =
    p.technology === "resin"
      ? (((p.washCureMinutes / 60) * p.washCureWatts) / 1000) * p.electricity +
        p.washCureCost
      : 0;
  const packaging = parts * p.packagingPerPart;
  const total = attempt + failure + finishing + washCure + packaging;
  const price = total / (1 - p.marginPercent / 100);
  const breakdown = {
    Material: material,
    "Extra material waste": waste,
    "Printer electricity": electricity,
    "Machine depreciation": depreciation,
    Maintenance: maintenance,
    "Setup labor": setup,
    "Job consumables": consumables,
    "Expected failed builds": failure,
    "Finishing labor": finishing,
    "Wash / cure equipment": washCure,
    Packaging: packaging,
  };
  const omitted = [];
  if (!p.packPrice) omitted.push("material price");
  if (!p.watts || !p.electricity) omitted.push("electricity");
  if (!p.printerPrice) omitted.push("machine depreciation");
  if (!p.laborHourly || (!p.setupMinutes && !p.finishMinutesPerPart))
    omitted.push("labor");
  if (p.technology === "resin" && !p.consumablesPerJob && !p.washCureCost)
    omitted.push("resin consumables / equipment wear");
  return {
    breakdown,
    total,
    perPart: total / parts,
    price,
    pricePerPart: price / parts,
    profit: price - total,
    omitted,
    parts,
    currency: p.currency,
  };
}
export function parseGcodeEstimates(text) {
  const result = {
    source: "Slicer comments in G-code",
    hours: null,
    grams: null,
    milliliters: null,
    warnings: [],
  };
  const time = [
    ...text.matchAll(
      /^;\s*(?:estimated printing time \(normal mode\)|model printing time|total estimated time)\s*=\s*(.+)$/gim,
    ),
  ].at(-1)?.[1];
  if (time) {
    let seconds = 0;
    for (const m of time.matchAll(/([\d.]+)\s*([dhms])/gi))
      seconds +=
        Number(m[1]) * { d: 86400, h: 3600, m: 60, s: 1 }[m[2].toLowerCase()];
    if (seconds > 0) result.hours = seconds / 3600;
  }
  if (result.hours == null) {
    const m = [...text.matchAll(/^;\s*TIME:\s*([\d.]+)\s*$/gim)].at(-1);
    if (m) result.hours = Number(m[1]) / 3600;
  }
  const mass = [
    ...text.matchAll(
      /^;\s*(?:total filament used \[g\]|filament used \[g\])\s*=\s*([^\r\n]+)/gim,
    ),
  ].at(-1);
  if (mass) {
    const parts = mass[1].split(",").map((v) => Number(v.trim()));
    if (parts.every((v) => Number.isFinite(v) && v >= 0)) {
      result.grams = parts.reduce((a, b) => a + b, 0);
      if (parts.length > 1)
        result.warnings.push(
          "Multiple filament quantities were combined. Use a blended material price or enter separate jobs.",
        );
    }
  }
  const volume = [
    ...text.matchAll(/^;\s*filament used \[cm3\]\s*=\s*([^\r\n]+)/gim),
  ].at(-1);
  if (volume) {
    const parts = volume[1].split(",").map((v) => Number(v.trim()));
    if (parts.every((v) => Number.isFinite(v) && v >= 0))
      result.milliliters = parts.reduce((a, b) => a + b, 0);
  }
  if (result.hours == null)
    result.warnings.push(
      "No supported print-time comment found; enter slicer time manually.",
    );
  if (result.grams == null && result.milliliters == null)
    result.warnings.push(
      "No supported mass or volume comment found; enter the slicer material amount manually.",
    );
  return result;
}
export function importProfile(data) {
  if (data?.format !== "model-scout-cost-profile" || data.version !== 1)
    throw new Error(
      "Import a Model Scout cost profile JSON (version 1). Slicer settings are not a complete costing profile.",
    );
  return validateProfile(data.profile);
}
