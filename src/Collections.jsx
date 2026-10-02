import React, { useState } from "react";
import { FolderPlus, FolderOpen } from "lucide-react";

export function CollectionList({ items, current, onChoose, onEdit, disabled }) {
  return (
    <section className="collection-nav">
      <div className="sidebar-rule" />
      <div className="filter-row">
        <h2>Collections</h2>
        <button
          className="icon-button"
          aria-label="New collection"
          disabled={disabled}
          onClick={() => onEdit("")}
        >
          <FolderPlus size={16} />
        </button>
      </div>
      {!items.length && (
        <p className="tiny muted">
          Keep parts, variants, and project details together.
        </p>
      )}
      {items.map((item) => (
        <button
          key={item.id}
          className={"nav-row " + (current === item.id ? "active" : "")}
          onClick={() => onChoose(item.id)}
          title={item.name}
        >
          <FolderOpen size={15} />
          <span>{item.name}</span>
          <b>{item.available}</b>
        </button>
      ))}
    </section>
  );
}
const empty = { name: "", creator: "", license: "", url: "", notes: "" };
export function CollectionEditor({ items, current, ids, onDone, onError }) {
  const [value, setValue] = useState(
    items.find((c) => c.id === current) || empty,
  );
  const [busy, setBusy] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  const action = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };
  const field = (name) => ({
    value: value[name],
    onChange: (e) => setValue((v) => ({ ...v, [name]: e.target.value })),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        action(async () => {
          const id = await window.scout.saveCollection(value);
          if (ids.length) await window.scout.collectionMembers(id, ids, false);
          onDone(id);
        });
      }}
    >
      <p>
        {ids.length
          ? `${ids.length.toLocaleString()} selected files will be added. A file can belong to several collections.`
          : "Group multi-part projects without changing their folders. Details are stored locally."}
      </p>
      <label className="field-label">
        Collection
        <select
          aria-label="Choose collection"
          disabled={busy}
          value={value.id || ""}
          onChange={(e) => {
            setValue(items.find((c) => c.id === e.target.value) || empty);
            setConfirmDelete(false);
          }}
        >
          <option value="">Create a new collection</option>
          {items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        Name
        <input {...field("name")} required maxLength={100} />
      </label>
      <div className="form-row">
        <label className="field-label">
          Creator
          <input {...field("creator")} maxLength={200} />
        </label>
        <label className="field-label">
          License / usage notes
          <input
            {...field("license")}
            placeholder="As stated by the creator"
            maxLength={300}
          />
        </label>
      </div>
      <label className="field-label">
        Source link
        <input
          {...field("url")}
          type="url"
          placeholder="https://…"
          maxLength={2000}
        />
      </label>
      <label className="field-label">
        Project notes
        <textarea {...field("notes")} rows={3} maxLength={4000} />
      </label>
      <p className="tiny muted">
        License notes are your records, not a grant of rights. Membership
        survives rescans; files outside the current scan remain listed as
        unavailable.
      </p>
      <div className="modal-actions collection-actions">
        {value.id && (
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() =>
              confirmDelete
                ? action(async () => {
                    await window.scout.deleteCollection(value.id);
                    onDone("");
                  })
                : setConfirmDelete(true)
            }
          >
            {confirmDelete
              ? "Confirm removal of collection only"
              : "Remove collection"}
          </button>
        )}
        {value.id && ids.length > 0 && (
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() =>
              action(async () => {
                await window.scout.collectionMembers(value.id, ids, true);
                onDone(value.id);
              })
            }
          >
            Remove selected members
          </button>
        )}
        <button
          className="button primary"
          disabled={busy || !value.name.trim()}
          type="submit"
        >
          {ids.length ? "Save and add selected" : "Save collection"}
        </button>
      </div>
      {confirmDelete && (
        <p className="small">
          Removing a collection only removes its grouping and project notes.
          Files stay where they are.
        </p>
      )}
    </form>
  );
}
