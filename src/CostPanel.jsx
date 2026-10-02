import React, { useEffect, useRef, useState } from "react";
import { profileDefaults, estimateCost, importProfile } from "./costing.mjs";
import { Upload, Download, Save, Calculator } from "lucide-react";
const groups = [
  [
    "Material & machine",
    [
      ["packPrice", "Material pack price"],
      ["packAmount", "Amount in pack (selected unit)"],
      ["density", "Material density (g/ml)"],
      ["printerPrice", "Printer purchase / allocated cost"],
      ["lifetimeHours", "Expected productive lifetime (hours)"],
      ["maintenanceHourly", "Maintenance cost / hour"],
      ["watts", "Average printer power (W)"],
      ["electricity", "Electricity price / kWh"],
    ],
  ],
  [
    "Labor & allowances",
    [
      ["laborHourly", "Labor rate / hour"],
      ["setupMinutes", "Setup labor / job (minutes)"],
      ["finishMinutesPerPart", "Finishing labor / part (minutes)"],
      ["consumablesPerJob", "Consumables / job"],
      ["packagingPerPart", "Packaging / finished part"],
      ["wastePercent", "Extra material waste (%)"],
      ["failurePercent", "Failed full builds (%)"],
      ["marginPercent", "Target gross margin (%)"],
    ],
  ],
];
export function CostPanel({ file, onClose }) {
  const [profile, setProfile] = useState({ ...profileDefaults });
  const [profiles, setProfiles] = useState([]),
    [inputs, setInputs] = useState({ hours: "", amount: "", parts: 1 }),
    [source, setSource] = useState("Manual slicer values"),
    [materialSource, setMaterialSource] = useState(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const upload = useRef();
  const chooseProfile = (value) => {
    setProfile(value);
    const unitChanged = value.materialUnit !== profile.materialUnit;
    const densityChanged =
      materialSource?.sourceUnit !== materialSource?.unit &&
      materialSource &&
      Number(value.density) !== Number(materialSource.density);
    if (unitChanged || densityChanged) {
      setInputs((p) => ({ ...p, amount: "" }));
      setMaterialSource(null);
      setSource(
        unitChanged
          ? "Material unit changed; enter slicer quantity again"
          : "Density changed; reimport or enter a reviewed material quantity",
      );
      setMessage("Review the material quantity before saving this estimate.");
    }
  };
  useEffect(() => {
    let current = true;
    Promise.all([
      window.scout.costProfiles(),
      window.scout.costEstimate(file.id),
    ])
      .then(([list, saved]) => {
        if (!current) return;
        setProfiles(list);
        if (saved) {
          setProfile(saved.profile);
          const legacyImport =
            /^Imported:/.test(saved.source) && !saved.materialSource;
          setInputs(
            legacyImport ? { ...saved.inputs, amount: "" } : saved.inputs,
          );
          setSource(saved.source);
          setMaterialSource(saved.materialSource || null);
          setMessage(
            legacyImport
              ? `Older imported estimate has no material conversion history. Saved quantity was ${saved.inputs.amount} ${saved.profile.materialUnit}; reimport or enter a reviewed quantity.`
              : saved.fileVersion !== file.version
                ? "This estimate belongs to an older file version. Re-slice and update it."
                : "Loaded the last saved estimate for this file.",
          );
        } else if (list.length) setProfile(list.at(-1));
      })
      .catch((e) => setMessage(e.message));
    return () => {
      current = false;
    };
  }, [file.id]);
  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setMessage(
        e.message.replace(
          /^Error invoking remote method '[^']+': (Error: )?/,
          "",
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  let estimate, error;
  try {
    estimate = estimateCost(profile, inputs);
  } catch (e) {
    error = e.message;
  }
  const money = (n) => `${profile.currency} ${n.toFixed(2)}`;
  const field = (key, label) => (
    <label className="field-label" key={key}>
      {label}
      <input
        type="number"
        min="0"
        step="any"
        value={profile[key]}
        onChange={(e) => chooseProfile({ ...profile, [key]: e.target.value })}
      />
    </label>
  );
  const readGcode = (id) =>
    run(async () => {
      const values = await window.scout.importGcodeCost(id);
      if (!values) return;
      const amount =
        profile.materialUnit === "g"
          ? (values.grams ??
            (values.milliliters == null
              ? null
              : values.milliliters * Number(profile.density)))
          : (values.milliliters ??
            (values.grams == null
              ? null
              : values.grams / Number(profile.density)));
      const direct =
        profile.materialUnit === "g" ? values.grams : values.milliliters;
      const sourceUnit =
        direct != null
          ? profile.materialUnit
          : profile.materialUnit === "g"
            ? "ml"
            : "g";
      const sourceAmount =
        sourceUnit === "g" ? values.grams : values.milliliters;
      setMaterialSource(
        amount == null
          ? null
          : {
              source: values.source,
              sourceUnit,
              sourceAmount,
              unit: profile.materialUnit,
              density:
                sourceUnit === profile.materialUnit
                  ? null
                  : Number(profile.density),
            },
      );
      setInputs((p) => ({
        ...p,
        hours: values.hours == null ? "" : Number(values.hours.toFixed(6)),
        amount: amount == null ? "" : Number(amount.toFixed(4)),
      }));
      setSource(`Imported: ${values.source}`);
      setMessage(
        [
          "Review the imported time, material amount, and part count.",
          ...values.warnings,
        ].join(" "),
      );
    });
  return (
    <div className="cost-panel">
      <p className="muted">
        Estimate a complete print job for <strong>{file.name}</strong>. Use the
        slicer’s whole-plate time and material, including supports and purge.
        Geometry alone cannot supply these.
      </p>
      <div className="cost-layout">
        <div className="cost-inputs">
          <div className="cost-profile-bar">
            <label className="field-label">
              Saved profile
              <select
                value=""
                onChange={(e) => {
                  const p = profiles.find((p) => p.name === e.target.value);
                  if (p) chooseProfile(p);
                }}
              >
                <option value="">Choose a printer / material profile…</option>
                {profiles.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} · {p.technology}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="text-button"
              onClick={() => chooseProfile({ ...profileDefaults })}
            >
              New profile
            </button>
          </div>
          <div className="form-grid">
            <label className="field-label">
              Profile name
              <input
                maxLength={100}
                value={profile.name}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, name: e.target.value }))
                }
              />
            </label>
            <label className="field-label">
              Technology
              <select
                aria-label="Technology"
                value={profile.technology}
                onChange={(e) =>
                  chooseProfile({
                    ...profile,
                    technology: e.target.value,
                    materialUnit:
                      e.target.value === "filament"
                        ? "g"
                        : profile.materialUnit,
                  })
                }
              >
                <option value="filament">Filament / FDM</option>
                <option value="resin">Resin / SLA / MSLA</option>
              </select>
            </label>
            <label className="field-label">
              Printer
              <input
                value={profile.printer}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, printer: e.target.value }))
                }
                placeholder="Your printer"
              />
            </label>
            <label className="field-label">
              Material
              <input
                value={profile.material}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, material: e.target.value }))
                }
                placeholder="Material / brand"
              />
            </label>
            <label className="field-label">
              Currency
              <input
                maxLength={3}
                value={profile.currency}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    currency: e.target.value.toUpperCase(),
                  }))
                }
              />
            </label>
            <label className="field-label">
              Material unit
              <select
                aria-label="Material unit"
                value={profile.materialUnit}
                onChange={(e) =>
                  chooseProfile({ ...profile, materialUnit: e.target.value })
                }
              >
                <option value="g">Grams (g)</option>
                {profile.technology === "resin" && (
                  <option value="ml">Milliliters (ml)</option>
                )}
              </select>
            </label>
          </div>
          {groups.map(([title, fields]) => (
            <details key={title} open={title === "Material & machine"}>
              <summary>{title}</summary>
              <div className="form-grid">
                {fields.map(([key, label]) => field(key, label))}
              </div>
            </details>
          ))}
          {profile.technology === "resin" && (
            <details open>
              <summary>Resin wash & cure</summary>
              <p className="tiny muted">
                Add gloves, IPA, filters, film and tank wear to job consumables.
                Include hands-on wash / cure time in finishing labor above.
              </p>
              <div className="form-grid">
                {field("washCureMinutes", "Wash / cure machine time (minutes)")}
                {field("washCureWatts", "Wash / cure average power (W)")}
                {field("washCureCost", "Wash / cure equipment wear per job")}
              </div>
            </details>
          )}
          <div className="profile-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  setProfiles(await window.scout.saveCostProfile(profile));
                  setMessage("Profile saved locally.");
                })
              }
            >
              <Save size={15} />
              Save profile
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => upload.current.click()}
            >
              <Upload size={15} />
              Import profile
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const p = await window.scout.exportCostProfile(profile);
                  if (p) setMessage("Profile exported to " + p);
                })
              }
            >
              <Download size={15} />
              Export
            </button>
            <input
              ref={upload}
              type="file"
              accept=".json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f)
                  run(async () => {
                    if (f.size > 256 * 1024)
                      throw new Error("Profile JSON must be under 256 KiB.");
                    chooseProfile(importProfile(JSON.parse(await f.text())));
                    setMessage(
                      "Profile imported for review. Save it to keep it.",
                    );
                  });
              }}
            />
          </div>
          <p className="tiny muted">
            Imports use Model Scout cost profile JSON, not slicer configuration
            files. Zero rates omit those costs.
          </p>
        </div>
        <div className="cost-result">
          <h3>
            <Calculator size={18} /> This print job
          </h3>
          {estimate && (
            <div className="cost-summary">
              <div className="cost-total">
                <span>Estimated job cost</span>
                <strong>{money(estimate.total)}</strong>
                <small>{money(estimate.perPart)} per finished part</small>
              </div>
              <div className="cost-price">
                <span>Price at {profile.marginPercent}% gross margin</span>
                <strong>{money(estimate.price)}</strong>
                <small>
                  {money(estimate.pricePerPart)} / part · before tax and
                  shipping
                </small>
              </div>
            </div>
          )}
          <div className="form-grid">
            <label className="field-label">
              Print time (hours)
              <input
                type="number"
                min="0"
                step="any"
                value={inputs.hours}
                onChange={(e) => {
                  setInputs((p) => ({ ...p, hours: e.target.value }));
                  setSource("Manual or edited slicer values");
                }}
              />
            </label>
            <label className="field-label">
              Material for whole job ({profile.materialUnit})
              <input
                type="number"
                min="0"
                step="any"
                value={inputs.amount}
                onChange={(e) => {
                  setInputs((p) => ({ ...p, amount: e.target.value }));
                  setMaterialSource(null);
                  setSource("Manual or edited slicer values");
                }}
              />
            </label>
            <label className="field-label">
              Finished parts per job
              <input
                type="number"
                min="1"
                step="1"
                value={inputs.parts}
                onChange={(e) =>
                  setInputs((p) => ({ ...p, parts: e.target.value }))
                }
              />
            </label>
          </div>
          <button
            className="button full"
            disabled={busy}
            onClick={() => readGcode()}
          >
            Read estimates from G-code…
          </button>
          {["gcode", "g", "gco"].includes(file.ext) && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => readGcode(file.id)}
            >
              Use selected G-code file
            </button>
          )}
          <p className="tiny muted">
            {source}. Text G-code comments from Prusa / Orca / Cura where
            available. For resin binary files, enter slicer values manually.
          </p>
          {materialSource &&
            materialSource.sourceUnit !== materialSource.unit && (
              <p className="tiny muted">
                Material converted from {materialSource.sourceAmount}{" "}
                {materialSource.sourceUnit} at {materialSource.density} g/ml.
                Changing density requires another review.
              </p>
            )}
          {estimate ? (
            <>
              <details>
                <summary>Cost breakdown</summary>
                <dl className="cost-breakdown">
                  {Object.entries(estimate.breakdown).map(([label, n]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{money(n)}</dd>
                    </div>
                  ))}
                </dl>
              </details>
              {estimate.omitted.length > 0 && (
                <p className="warning tiny">
                  Not included yet: {estimate.omitted.join(", ")}.
                </p>
              )}
            </>
          ) : (
            <p className="muted small">{error}</p>
          )}
          <details>
            <summary>How the estimate works</summary>
            <p className="tiny">
              Failure allowance assumes a failed build consumes the full
              printing, setup and consumables cost before retrying. Finishing,
              wash / cure and packaging apply to successful parts. Cost is
              divided equally among the entered parts; mixed parts need their
              own allocation. Gross margin is a share of selling price, not
              markup.
            </p>
          </details>
        </div>
      </div>
      {message && (
        <p role="status" className="cost-message">
          {message}
        </p>
      )}
      <div className="modal-actions">
        <button className="button" onClick={onClose}>
          Close
        </button>
        <button
          className="button primary"
          disabled={!estimate || busy}
          onClick={() =>
            run(async () => {
              await window.scout.saveCostEstimate(
                file.id,
                profile,
                inputs,
                source,
                materialSource,
              );
              setMessage(
                "Estimate saved with this model and its profile assumptions.",
              );
            })
          }
        >
          Save estimate with model
        </button>
      </div>
    </div>
  );
}
