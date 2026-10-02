import React, { useState } from "react";
import { Bookmark, Tag, X, Star } from "lucide-react";

export function SearchTools({ query, onFilter, tags, onSave }) {
  const [expanded, setExpanded] = useState(false);
  const include = query.tags || [],
    exclude = query.excludeTags || [];
  const chips = [
    ...(query.category
      ? [{ label: query.category, remove: () => onFilter({ category: "" }) }]
      : []),
    ...(query.kind
      ? [{ label: query.kind, remove: () => onFilter({ kind: "" }) }]
      : []),
    ...include.map((t) => ({
      label: t,
      remove: () => onFilter({ tags: include.filter((v) => v !== t) }),
    })),
    ...exclude.map((t) => ({
      label: "Exclude: " + t,
      remove: () => onFilter({ excludeTags: exclude.filter((v) => v !== t) }),
    })),
  ];
  return (
    <div className="library-tools">
      <div className="filter-row">
        <button
          className={"text-button " + (expanded ? "active" : "")}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <Tag size={14} /> Tag filters
        </button>
        <button className="text-button" onClick={onSave}>
          <Bookmark size={14} /> Save search
        </button>
        {(chips.length > 0 ||
          query.search ||
          query.ext ||
          query.collection) && (
          <button
            className="text-button"
            onClick={() =>
              onFilter({
                search: "",
                ext: "",
                category: "",
                kind: "",
                collection: "",
                tags: [],
                excludeTags: [],
              })
            }
          >
            Clear filters
          </button>
        )}
      </div>
      {expanded && (
        <div className="tag-filter-panel">
          <label>
            Match
            <select
              aria-label="Tag matching"
              value={query.tagMode || "all"}
              onChange={(e) => onFilter({ tagMode: e.target.value })}
            >
              <option value="all">All included tags</option>
              <option value="any">Any included tag</option>
            </select>
          </label>
          <label>
            Include
            <select
              aria-label="Include tag"
              value=""
              onChange={(e) =>
                e.target.value &&
                onFilter({ tags: [...new Set([...include, e.target.value])] })
              }
            >
              <option value="">Choose a tag…</option>
              {tags
                .filter((t) => !include.includes(t.tag))
                .map((t) => (
                  <option key={t.tag} value={t.tag}>
                    {t.tag} ({t.count})
                  </option>
                ))}
            </select>
          </label>
          <label>
            Exclude
            <select
              aria-label="Exclude tag"
              value=""
              onChange={(e) =>
                e.target.value &&
                onFilter({
                  excludeTags: [...new Set([...exclude, e.target.value])],
                })
              }
            >
              <option value="">Choose a tag…</option>
              {tags
                .filter((t) => !exclude.includes(t.tag))
                .map((t) => (
                  <option key={t.tag} value={t.tag}>
                    {t.tag} ({t.count})
                  </option>
                ))}
            </select>
          </label>
        </div>
      )}
      {chips.length > 0 && (
        <div className="filter-chips">
          {chips.map((c) => (
            <button
              key={c.label}
              onClick={c.remove}
              aria-label={"Remove filter " + c.label}
            >
              {c.label}
              <X size={12} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export function SavedSearches({ items, onLoad, onRemove }) {
  return (
    <>
      <div className="sidebar-rule" />
      <h2>Saved searches</h2>
      {!items.length ? (
        <p className="tiny muted">
          Save a useful set of filters to return to it in one click.
        </p>
      ) : (
        items.map((s) => (
          <div className="saved-search" key={s.name}>
            <button
              className="category-link"
              title={s.name}
              onClick={() => onLoad(s.query)}
            >
              <Bookmark size={14} />
              <span>{s.name}</span>
            </button>
            <button
              className="icon-button"
              aria-label={"Remove saved search " + s.name}
              onClick={() => onRemove(s.name)}
            >
              <X size={13} />
            </button>
          </div>
        ))
      )}
    </>
  );
}
export function MetadataEditor({ file, onSave, disabled }) {
  const [text, setText] = useState(file.tags.join(", "));
  return (
    <div className="metadata-editor">
      <div className="filter-row">
        <strong>Personal library</strong>
        <button
          className={
            "text-button favorite " + (file.favorite ? "is-favorite" : "")
          }
          aria-label={
            file.favorite ? "Remove from favorites" : "Add to favorites"
          }
          aria-pressed={!!file.favorite}
          disabled={disabled}
          onClick={() => onSave({ favorite: !file.favorite })}
        >
          <Star size={15} fill={file.favorite ? "currentColor" : "none"} />
          {file.favorite ? "Favorite" : "Add favorite"}
        </button>
      </div>
      <label className="field-label">
        Tags
        <input
          aria-label="Model tags"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="terrain, gift, needs review"
          maxLength={3000}
        />
      </label>
      <p className="tiny muted">
        Separate tags with commas. These stay in your local catalog.
      </p>
      <button
        className="button full"
        disabled={disabled}
        onClick={() => onSave({ tags: text, mode: "replace" })}
      >
        Save tags
      </button>
    </div>
  );
}
