import React, { useState } from "react";
import { Preview } from "./Preview";
import { ScanLine, Wrench, Download } from "lucide-react";
const labels = {
  triangles: "Triangles",
  vertices: "Exact unique vertices",
  degenerate: "Zero-area triangles",
  duplicates: "Duplicate triangles",
  invalid: "Invalid triangles",
  boundaryEdges: "Open edges",
  nonManifoldEdges: "Edges with >2 faces",
  inconsistentEdges: "Inconsistent edge winding",
  components: "Connected vertex groups",
};
export function MeshPanel({ file, onClose, onSaved }) {
  const [report, setReport] = useState(
      () => JSON.parse(file.analysis || "{}").meshReport || null,
    ),
    [plan, setPlan] = useState(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [options, setOptions] = useState({
    scale: 100,
    rotation: [0, 0, 0],
    removeDegenerate: false,
    removeDuplicates: false,
  });
  const change = (values) => {
    setOptions((p) => ({ ...p, ...values }));
    setPlan(null);
  };
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
  return (
    <div className="mesh-panel">
      <p>
        Inspect <strong>{file.name}</strong>, then review an edited copy before
        saving it. The original remains unchanged. These tools support STL files
        up to 64 MiB and 500,000 triangles.
      </p>
      <div className="mesh-layout">
        <div>
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                setPlan(null);
                const result = await window.scout.meshAnalyze(file.id);
                setReport(result.before);
                setMessage("Basic mesh checks complete.");
              })
            }
          >
            <ScanLine size={16} />
            {busy ? "Working…" : "Run mesh checks"}
          </button>
          {report && (
            <>
              <table className="mesh-report">
                <thead>
                  <tr>
                    <th>Check</th>
                    <th>Original</th>
                    {plan && <th>Edited</th>}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(labels).map(([key, label]) => (
                    <tr key={key}>
                      <td>{label}</td>
                      <td>{report[key].toLocaleString()}</td>
                      {plan && <td>{plan.after[key].toLocaleString()}</td>}
                    </tr>
                  ))}
                  <tr>
                    <td>Bounds (model units)</td>
                    <td>
                      {report.dimensions
                        .map((n) => Number(n.toPrecision(4)))
                        .join(" × ")}
                    </td>
                    {plan && (
                      <td>
                        {plan.after.dimensions
                          .map((n) => Number(n.toPrecision(4)))
                          .join(" × ")}
                      </td>
                    )}
                  </tr>
                </tbody>
              </table>
              <ul className="mesh-suggestions">
                {(plan?.after || report).suggestions.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <p className="tiny muted">{report.scope}</p>
            </>
          )}
        </div>
        <div className="mesh-edits">
          <h3>Simple edits</h3>
          <label className="field-label">
            Uniform scale (%)
            <input
              type="number"
              min="0.1"
              max="10000"
              step="any"
              disabled={busy}
              value={options.scale}
              onChange={(e) => change({ scale: e.target.value })}
            />
          </label>
          <div className="rotation-fields">
            {["X", "Y", "Z"].map((axis, i) => (
              <label className="field-label" key={axis}>
                Rotate {axis} (°)
                <input
                  type="number"
                  min="-360"
                  max="360"
                  step="any"
                  disabled={busy}
                  value={options.rotation[i]}
                  onChange={(e) =>
                    change({
                      rotation: options.rotation.map((v, j) =>
                        j === i ? e.target.value : v,
                      ),
                    })
                  }
                />
              </label>
            ))}
          </div>
          <p className="tiny muted">
            Rotation uses the model origin, in XYZ order; scaling follows. STL
            has no declared physical units. Confirm the exported size in your
            slicer.
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={options.removeDegenerate}
              disabled={busy}
              onChange={(e) => change({ removeDegenerate: e.target.checked })}
            />{" "}
            Remove zero-area triangles
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={options.removeDuplicates}
              disabled={busy}
              onChange={(e) => change({ removeDuplicates: e.target.checked })}
            />{" "}
            Remove coincident duplicate triangles
          </label>
          <p className="tiny muted">
            Holes are not filled and disconnected parts are not merged. Normals
            are recalculated when exporting; winding is preserved.
          </p>
          <button
            className="button primary full"
            disabled={busy}
            onClick={() =>
              run(async () => {
                setPlan(null);
                const result = await window.scout.meshPrepare(file.id, options);
                setReport(result.before);
                setPlan(result);
                setMessage(
                  "Review the edited shape and comparison before saving.",
                );
              })
            }
          >
            <Wrench size={16} />
            Prepare edited preview
          </button>
          {plan && (
            <div className="edited-preview">
              <strong>Edited copy · normalized view</strong>
              <Preview
                key={plan.id}
                file={{
                  id: plan.id,
                  editedToken: plan.id,
                  name: "edited.stl",
                  ext: "stl",
                  preview: 1,
                }}
              />
              <p className="tiny muted">
                The view fits the model to the frame. Use the bounds comparison
                to check changes in size.
              </p>
            </div>
          )}
        </div>
      </div>
      {message && (
        <p role="status" className="cost-message">
          {message}
        </p>
      )}
      <div className="modal-actions">
        <button className="button" disabled={busy} onClick={onClose}>
          Close
        </button>
        <button
          className="button primary"
          disabled={!plan || busy}
          onClick={() =>
            run(async () => {
              const result = await window.scout.meshExport(plan.id);
              if (result) {
                setPlan(null);
                setMessage(
                  "Verified edited copy saved: " +
                    result.path +
                    ". Edit receipt: " +
                    result.log,
                );
                onSaved(result);
              }
            })
          }
        >
          <Download size={16} />
          Save new STL copy…
        </button>
      </div>
    </div>
  );
}
