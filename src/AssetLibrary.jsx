import React, { useState } from "react";
const size = (n) => {
  if (!n) return "0 B";
  const k = Math.min(4, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** k).toFixed(k ? 1 : 0)} ${["B", "KiB", "MiB", "GiB", "TiB"][k]}`;
};
export function AssetLibrary({ query, running, progress, onError }) {
  const [destination, setDestination] = useState("");
  const [scope, setScope] = useState("all");
  const [prepared, setPrepared] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const action = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const locked = busy || running;
  return (
    <div className="asset-library-panel">
      <p>
        Create a new library containing one copy of each unique file. Original
        files stay in place. Categories and file families form the new folder
        structure; indexes retain every source path and duplicate alias.
      </p>
      <label className="field-label">
        Catalog scope
        <select
          aria-label="Asset catalog scope"
          value={scope}
          disabled={locked}
          onChange={(e) => {
            setScope(e.target.value);
            setPrepared(null);
          }}
        >
          <option value="all">Entire current scan</option>
          <option value="filtered">Current file filters</option>
        </select>
      </label>
      {scope === "filtered" && query.kind === "unique" && (
        <p className="tiny muted">
          The Unique files view is expanded for preparation so every matching
          source alias is freshly verified and retained. Other filters still
          apply.
        </p>
      )}
      <label className="field-label">
        Create the new library inside
        <div className="asset-destination">
          <input
            aria-label="Asset library parent folder"
            value={destination}
            disabled={locked}
            onChange={(e) => {
              setDestination(e.target.value);
              setPrepared(null);
            }}
            placeholder="Choose an existing folder outside your search roots"
          />
          <button
            disabled={locked}
            onClick={() =>
              action(async () => {
                const folder = await window.scout.chooseDestination();
                if (folder) {
                  setDestination(folder);
                  setPrepared(null);
                }
              })
            }
          >
            Browse
          </button>
        </div>
      </label>
      <p className="tiny muted">
        A new Asset-Library folder will be created here. Preparation reads and
        hashes files, then writes the catalog and copy plan. It does not copy
        the assets yet. Archive contents are included only if enabled in the
        scan.
      </p>
      <button
        className="button primary"
        disabled={locked || !destination.trim()}
        onClick={() =>
          action(async () => {
            setPrepared(null);
            setReceipt(null);
            setReviewed(false);
            setAttempted(false);
            setPrepared(
              await window.scout.assetPrepare(
                scope === "all" ? {} : query,
                destination.trim(),
              ),
            );
          })
        }
      >
        Prepare unique asset library
      </button>
      {locked && (
        <p role="status">
          {progress?.phase === "assetCopy"
            ? "Copying and verifying"
            : "Preparing catalog"}
          : {(progress?.done || 0).toLocaleString()} /{" "}
          {(progress?.total || 0).toLocaleString()}. Files already written are
          retained.
        </p>
      )}
      {running && (
        <button className="button" onClick={() => window.scout.cancel()}>
          Cancel catalog / copy
        </button>
      )}
      {prepared && (
        <section className="asset-review" aria-label="Asset library review">
          <h3>Review the new organization</h3>
          <p>
            <strong>
              {prepared.summary.uniqueFiles.toLocaleString()} unique files
            </strong>{" "}
            · {size(prepared.summary.uniqueBytes)} to copy
            <br />
            {prepared.summary.duplicateCopies.toLocaleString()} extra copies
            excluded · {size(prepared.summary.redundantBytes)} saved
          </p>
          <p className="asset-path">{prepared.directory}</p>
          <p>
            {prepared.summary.referenceReview.toLocaleString()} source files
            flagged for reference review. Maps, atlases, fonts and projects may
            need updated references before game use. This library changes paths
            and filenames and retains mappings; it does not repair references.
          </p>
          {prepared.summary.historicalWarnings.length > 0 && (
            <p className="warning">
              Historical path mapping warnings:{" "}
              {prepared.summary.historicalWarnings
                .map((x) => x.message)
                .join("; ")}
            </p>
          )}
          {prepared.summary.status !== "ready" && (
            <p className="warning">
              Catalog is {prepared.summary.status}.{" "}
              {prepared.summary.errorCount} file errors. Resolve issues and
              prepare again before copying.
            </p>
          )}
          <div className="asset-preview">
            <table>
              <thead>
                <tr>
                  <th>Sample file</th>
                  <th>New folder</th>
                </tr>
              </thead>
              <tbody>
                {prepared.preview.map((item) => (
                  <tr key={item.relativePath}>
                    <td>{item.name}</td>
                    <td>
                      {item.category}
                      {item.category !== item.family ? " / " + item.family : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tiny muted">
            START_HERE.md explains the catalog. assets.jsonl lists unique
            assets; sources.jsonl retains aliases and pack information; category
            indexes allow another chat to read smaller lists. copy-plan.jsonl
            contains the full planned file-by-file destinations. License
            documents are indexed; licensing is not inferred.
          </p>
          <button
            className="button"
            disabled={locked}
            onClick={() =>
              action(() => window.scout.revealAssetCatalog(prepared.id))
            }
          >
            Show catalog and full copy plan
          </button>
          <label className="check-label asset-confirm">
            <input
              type="checkbox"
              aria-label="Review unique asset copy"
              checked={reviewed}
              disabled={locked || attempted}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            <span>
              I reviewed the destination, full copy plan, and reference
              warnings.
            </span>
          </label>
          <button
            className="button primary"
            disabled={
              locked ||
              !reviewed ||
              attempted ||
              prepared.summary.status !== "ready"
            }
            onClick={() =>
              action(async () => {
                setAttempted(true);
                setReceipt(await window.scout.assetCopy(prepared.id));
              })
            }
          >
            Copy unique assets to new library
          </button>
          {receipt && (
            <p role="status">
              Copy {receipt.status}: {receipt.copied.toLocaleString()} verified
              copies, {receipt.failed.toLocaleString()} failures. Source files
              retained. See copy-receipt.json and copy-journal.jsonl for
              details.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
