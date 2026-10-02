import React, { useState, useEffect, useRef } from "react";
import { Preview } from "./Preview";

export function GeometryPanel({ ids, onQueue, running }) {
  const [scope, setScope] = useState(ids.length ? "selected" : "all");
  const [retry, setRetry] = useState(false),
    [state, setState] = useState(null),
    [message, setMessage] = useState("");
  const [result, setResult] = useState({ total: 0, page: 0, groups: [] }),
    [chosen, setChosen] = useState(new Map());
  const [left, setLeft] = useState(null),
    [right, setRight] = useState(null);
  const request = useRef(0);
  const load = async (page = 0) => {
    const n = ++request.current;
    try {
      const value = await window.scout.geometryGroups(page);
      if (n === request.current) setResult(value);
    } catch (error) {
      setMessage(error.message);
    }
  };
  useEffect(() => {
    window.scout.info().then((info) => setState(info.lastGeometryCheck));
    load();
    return window.scout.onProgress((value) => {
      if (value.phase === "geometry" || typeof value.analyzed === "number") {
        setState(value);
        if (!value.running) load();
      }
    });
  }, []);
  const toggle = (file, group) =>
    setChosen((current) => {
      const next = new Map(current);
      next.has(file.id)
        ? next.delete(file.id)
        : next.set(file.id, {
            ...file,
            signature: group.signature,
            groupCount: group.count,
          });
      return next;
    });
  const start = async () => {
    try {
      setMessage("");
      setChosen(new Map());
      setLeft(null);
      setRight(null);
      await window.scout.geometryCompare({
        ids: scope === "selected" ? ids : undefined,
        retry,
      });
    } catch (error) {
      setMessage(error.message);
    }
  };
  const selectedCounts = new Map();
  for (const file of chosen.values())
    selectedCounts.set(
      file.signature,
      (selectedCounts.get(file.signature) || 0) + 1,
    );
  const missingKeeper = [...chosen.values()].some(
    (file) => selectedCounts.get(file.signature) >= file.groupCount,
  );
  const queue = async () => {
    try {
      const checked = await window.scout.geometrySelection([...chosen.keys()]);
      onQueue(checked);
    } catch (error) {
      setMessage(error.message);
    }
  };
  return (
    <div className="geometry-review">
      <p>
        Find matching triangle geometry in STL, OBJ, and PLY exports. Placement,
        vertex/triangle order, and winding are ignored; scale and orientation
        are preserved. Precision is 0.00001 model units. Materials, colors,
        normals, and units are not compared. Different triangulation or rotation
        may miss a match.
      </p>
      <div className="geometry-controls">
        <label>
          Compare
          <select
            aria-label="Geometry comparison scope"
            value={scope}
            disabled={running}
            onChange={(e) => setScope(e.target.value)}
          >
            {ids.length > 0 && (
              <option value="selected">Selected files ({ids.length})</option>
            )}
            <option value="all">
              All supported files in the current catalog
            </option>
          </select>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={retry}
            disabled={running}
            onChange={(e) => setRetry(e.target.checked)}
          />
          Retry previous failures
        </label>
        <button className="button primary" disabled={running} onClick={start}>
          Compare geometry
        </button>
        {running && state?.running && (
          <button className="button" onClick={() => window.scout.cancel()}>
            Cancel comparison
          </button>
        )}
      </div>
      <p className="small muted">
        Local, one file at a time. Limit: 64 MiB / 500,000 triangles per file.
        Cancelling keeps completed work; run again to reuse it.
      </p>
      {state && (
        <p role="status">
          {state.running
            ? "Comparing"
            : state.phase === "cancelled"
              ? "Cancelled"
              : "Last comparison"}
          : {state.done} / {state.total} · {state.cached} reused ·{" "}
          {state.analyzed} analyzed · {state.errorCount} issues
        </p>
      )}
      {message && <p className="warning">{message}</p>}
      {state?.errors?.length > 0 && (
        <details>
          <summary>Comparison issues ({state.errorCount})</summary>
          <div className="geometry-errors">
            {state.errors.map((error, i) => (
              <p className="small break" key={i}>
                {error.path}: {error.message}
              </p>
            ))}
          </div>
        </details>
      )}
      <div className="geometry-pagination">
        <strong>
          {result.total} matching geometry{" "}
          {result.total === 1 ? "group" : "groups"}
        </strong>
        <div>
          <button
            className="button"
            disabled={!result.page || running}
            onClick={() => load(result.page - 1)}
          >
            Previous groups
          </button>
          <span>
            Page {result.total ? result.page + 1 : 0} /{" "}
            {Math.ceil(result.total / 20)}
          </span>
          <button
            className="button"
            disabled={(result.page + 1) * 20 >= result.total || running}
            onClick={() => load(result.page + 1)}
          >
            Next groups
          </button>
        </div>
      </div>
      {!result.total && (
        <p className="muted">
          Run a comparison to discover candidates. No match does not prove two
          models are different.
        </p>
      )}
      <div className="geometry-groups">
        {result.groups.map((group) => (
          <section key={group.signature}>
            <strong>
              {group.count} files ·{" "}
              {group.files[0].geometry.triangles.toLocaleString()} triangles
            </strong>
            {group.truncated && (
              <p className="tiny">
                Showing the first 80 files; review the rest in the library
                before choosing a keeper.
              </p>
            )}
            {group.files.map((file) => (
              <div className="geometry-file" key={file.id}>
                <label>
                  <input
                    type="checkbox"
                    disabled={running}
                    aria-label={"Select candidate " + file.name}
                    checked={chosen.has(file.id)}
                    onChange={() => toggle(file, group)}
                  />
                  <span>
                    <strong>
                      {file.name} <em>{file.ext.toUpperCase()}</em>
                    </strong>
                    <small>
                      {file.path}
                      {file.member ? " :: " + file.member : ""}
                    </small>
                  </span>
                </label>
                <div>
                  <button className="text-button" onClick={() => setLeft(file)}>
                    Preview left
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setRight(file)}
                  >
                    Preview right
                  </button>
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
      {(left || right) && (
        <div className="geometry-previews">
          {[left, right].map((file, i) => (
            <section key={i}>
              <strong>{file?.name || "Choose another candidate"}</strong>
              {file && (
                <>
                  <Preview file={file} />
                  <p className="tiny">
                    Bounds:{" "}
                    {file.geometry.dimensions
                      .map((n) => n.toFixed(3))
                      .join(" × ")}{" "}
                    model units
                  </p>
                </>
              )}
            </section>
          ))}
        </div>
      )}
      {missingKeeper && (
        <p className="warning">
          Keep at least one file in every matching group before queuing extras.
        </p>
      )}
      <div className="modal-actions">
        <span>{chosen.size} selected · every selection requires review</span>
        <button
          className="button"
          disabled={!chosen.size || running}
          onClick={() => setChosen(new Map())}
        >
          Clear candidates
        </button>
        <button
          className="button primary"
          disabled={!chosen.size || running || missingKeeper}
          onClick={queue}
        >
          Review selected transfers
        </button>
      </div>
    </div>
  );
}
