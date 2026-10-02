import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Star,
  Archive,
  RefreshCw,
  Image,
  LoaderCircle,
} from "lucide-react";

export function Gallery({
  rows,
  selected,
  active,
  onOpen,
  onToggle,
  onFavorite,
  paused,
  onError,
}) {
  const host = useRef(null);
  const [visible, setVisible] = useState([]);
  const [prepare, setPrepare] = useState(false);
  const pageKey = rows.map((r) => r.id).join(",");
  useEffect(() => {
    setPrepare(false);
    setVisible([]);
    host.current.scrollTop = 0;
    const ids = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          entry.isIntersecting
            ? ids.add(entry.target.dataset.id)
            : ids.delete(entry.target.dataset.id);
        setVisible([...ids]);
      },
      { root: host.current, rootMargin: "100px" },
    );
    host.current
      .querySelectorAll("[data-id]")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pageKey]);
  useEffect(() => {
    if (paused) return;
    const ids = (prepare ? rows : rows.filter((r) => visible.includes(r.id)))
      .filter((r) => r.preview && !r.hasThumbnail && !r.thumbError)
      .map((r) => r.id);
    const timer = setTimeout(
      () => window.scout.thumbnails(ids).catch((e) => onError(e.message)),
      120,
    );
    return () => clearTimeout(timer);
  }, [rows, visible, prepare, paused]);
  useEffect(
    () => () => {
      window.scout.stopThumbnails().catch(() => {});
    },
    [],
  );
  return (
    <div className="gallery-shell">
      <div className="gallery-note">
        <span>
          <Image size={14} />{" "}
          {paused
            ? "Previews paused during this operation"
            : "Previews load as you browse and stay cached on this PC."}
        </span>
        <button
          className="text-button"
          disabled={paused}
          onClick={() => setPrepare(true)}
        >
          Prepare this page
        </button>
      </div>
      <div className="gallery" ref={host}>
        {rows.map((r) => (
          <article
            key={r.id}
            data-id={r.id}
            className={
              "model-card " +
              (active?.id === r.id ? "focused " : "") +
              (selected.has(r.id) ? "selected" : "")
            }
          >
            <div className="card-controls">
              <input
                type="checkbox"
                aria-label={"Select " + r.name}
                checked={selected.has(r.id)}
                onChange={() => onToggle(r.id)}
              />
              <button
                className={
                  "icon-button favorite " + (r.favorite ? "is-favorite" : "")
                }
                aria-label={(r.favorite ? "Unfavorite " : "Favorite ") + r.name}
                aria-pressed={!!r.favorite}
                onClick={() => onFavorite(r)}
              >
                <Star size={17} fill={r.favorite ? "currentColor" : "none"} />
              </button>
            </div>
            <button
              className="card-open"
              aria-label={"Inspect " + r.name}
              onClick={() => onOpen(r)}
            >
              <div className="card-image">
                {r.hasThumbnail ? (
                  <img
                    src={`scout://app/thumbnail/${r.id}?v=${encodeURIComponent(r.version)}`}
                    alt={"3D preview of " + r.name}
                  />
                ) : (
                  <div className="card-placeholder">
                    {r.preview && !r.thumbError && !paused ? (
                      <LoaderCircle
                        size={27}
                        className={
                          visible.includes(r.id) || prepare ? "spin" : ""
                        }
                      />
                    ) : (
                      <Box size={34} strokeWidth={1.2} />
                    )}
                    <span>
                      {r.thumbError
                        ? "Preview unavailable"
                        : !r.preview
                          ? "No preview for this format"
                          : paused
                            ? "Preview paused"
                            : "Preparing preview"}
                    </span>
                  </div>
                )}
              </div>
              <div className="card-copy">
                <div className="card-type">
                  {r.member && <Archive size={12} />}
                  <span>{r.ext}</span>
                  <span>{(r.size / 1024 / 1024).toFixed(2)} MiB</span>
                </div>
                <strong title={r.name}>{r.name}</strong>
                <small title={r.path + (r.member ? " :: " + r.member : "")}>
                  {r.path}
                </small>
                <span className="card-category">
                  {r.reviewedCategory || r.category}
                </span>
                {r.tags.length > 0 && (
                  <div className="card-tags">
                    {r.tags.slice(0, 3).map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                    {r.tags.length > 3 && <span>+{r.tags.length - 3}</span>}
                  </div>
                )}
              </div>
            </button>
            {r.thumbError && (
              <button
                className="retry-thumbnail text-button"
                title={r.thumbError}
                disabled={paused}
                onClick={() =>
                  window.scout
                    .thumbnails([r.id], true)
                    .catch((e) => onError(e.message))
                }
              >
                <RefreshCw size={12} /> Retry preview
              </button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
