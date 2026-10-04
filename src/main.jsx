import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  Grid2X2,
  List,
  Star,
  Tag,
  Bookmark,
  Box,
  Search,
  FolderPlus,
  FolderOpen,
  Play,
  Square,
  Copy,
  ArrowRightLeft,
  Files,
  SlidersHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  Download,
  Layers,
  Archive,
  ShieldCheck,
  ScanLine,
  AlertCircle,
  Sparkles,
  ExternalLink,
  Settings,
  LoaderCircle,
  CheckCircle2,
} from "lucide-react";
import { Preview } from "./Preview";
import { Gallery } from "./Gallery";
import { SearchTools, SavedSearches, MetadataEditor } from "./LibraryTools";
import { CostPanel } from "./CostPanel";
import { MeshPanel } from "./MeshPanel";
import { CollectionList, CollectionEditor } from "./Collections";
import { GeometryPanel } from "./GeometryPanel";
import { AssetLibrary } from "./AssetLibrary";
import { RasterPreview, hasRasterPreview } from "./RasterPreview";
import "./styles.css";
const api = window.scout;
const bytes = (n) => {
  if (!n) return "0 B";
  const k = Math.min(4, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** k).toFixed(k ? 1 : 0)} ${["B", "KiB", "MiB", "GiB", "TiB"][k]}`;
};
const count = (n) => (n || 0).toLocaleString();
function Button({ icon: Icon, children, className = "", ...props }) {
  return (
    <button className={"button " + className} {...props}>
      {Icon && <Icon size={16} />}
      <span>{children}</span>
    </button>
  );
}
function Modal({ title, children, onClose, wide = false, canClose = true }) {
  const ref = useRef();
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={(event) => {
        event.preventDefault();
        if (canClose) onClose();
      }}
    >
      <div className="modal-title">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          disabled={!canClose}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function App() {
  const [legalNotices, setLegalNotices] = useState(null);
  const [collectionEdit, setCollectionEdit] = useState("");
  const [collectionIds, setCollectionIds] = useState([]);
  const [geometryIds, setGeometryIds] = useState([]);
  const [view, setView] = useState("list"),
    [savedSearches, setSavedSearches] = useState([]),
    [searchName, setSearchName] = useState(""),
    [bulkTags, setBulkTags] = useState(""),
    [tagEdit, setTagEdit] = useState("add"),
    [bulkFavorite, setBulkFavorite] = useState("keep");
  const [info, setInfo] = useState(null),
    [roots, setRoots] = useState([]),
    [manualRoot, setManualRoot] = useState(""),
    [archives, setArchives] = useState(false),
    [extras, setExtras] = useState(false);
  const [scanMode, setScanMode] = useState("models");
  const [catalogMode, setCatalogMode] = useState("models");
  const [progress, setProgress] = useState(null),
    [stats, setStats] = useState({ extensions: [], categories: [] }),
    [rows, setRows] = useState([]),
    [total, setTotal] = useState(0),
    [locations, setLocations] = useState({
      rows: [],
      count: 0,
      page: 0,
      pageSize: 20,
    }),
    [query, setQuery] = useState({
      search: "",
      searchScope: "name",
      locationPage: 0,
      ext: "",
      category: "",
      kind: "",
      collection: "",
      sort: "name",
      direction: "asc",
      page: 0,
      pageSize: 150,
      tags: [],
      excludeTags: [],
      tagMode: "all",
    });
  const [selected, setSelected] = useState(new Set()),
    [active, setActive] = useState(null),
    [facts, setFacts] = useState(null),
    [category, setCategory] = useState(""),
    [notes, setNotes] = useState(""),
    [contentFacts, setContentFacts] = useState(null);
  const [modal, setModal] = useState(null),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [groups, setGroups] = useState([]),
    [keepers, setKeepers] = useState({}),
    [groupPage, setGroupPage] = useState(0),
    [groupTotal, setGroupTotal] = useState(0);
  const [destination, setDestination] = useState(""),
    [mode, setMode] = useState("copy"),
    [layout, setLayout] = useState("category"),
    [includeReferences, setIncludeReferences] = useState(true),
    [plan, setPlan] = useState(null),
    [receipt, setReceipt] = useState(null);
  const [key, setKey] = useState(""),
    [model, setModel] = useState("gpt-4.1-mini"),
    [aiImage, setAiImage] = useState(""),
    [aiText, setAiText] = useState(""),
    [bulkCategory, setBulkCategory] = useState("");
  const preview = useRef(),
    queryRef = useRef(query),
    refreshTimer = useRef(),
    requestNumber = useRef(0);
  queryRef.current = query;
  const running = !!progress?.running;
  const refresh = useCallback(async () => {
    const n = ++requestNumber.current;
    const [result, s] = await Promise.all([
      api.query(queryRef.current),
      api.stats(),
    ]);
    if (n !== requestNumber.current) return;
    setRows(result.rows);
    if (result.page !== queryRef.current.page)
      setQuery((q) => ({ ...q, page: result.page }));
    setTotal(result.count);
    setLocations(result.locations);
    setStats(s);
  }, []);
  const run = async (fn) => {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      setToast(
        e.message.replace(
          /^Error invoking remote method '[^']+': (Error: )?/,
          "",
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    api.info().then((data) => {
      setInfo(data);
      setSavedSearches(data.savedSearches || []);
      setView(data.view);
      setQuery((q) => ({ ...q, pageSize: data.view === "gallery" ? 24 : 150 }));
      if (data.lastScan) {
        setProgress(
          data.lastScan.running
            ? { ...data.lastScan, running: false, phase: "cancelled" }
            : data.lastScan,
        );
        setRoots(data.lastScan.roots || []);
        setScanMode(data.lastScan.mode || "models");
        setCatalogMode(data.lastScan.mode || "models");
      }
    });
    refresh();
    return api.onProgress((data) => {
      if (data.mode) setCatalogMode(data.mode);
      setProgress(data);
      if (!refreshTimer.current)
        refreshTimer.current = setTimeout(() => {
          refreshTimer.current = null;
          refresh();
        }, 350);
    });
  }, []);
  useEffect(() => {
    const id = setTimeout(
      () => refresh().catch((e) => setToast(e.message)),
      140,
    );
    return () => clearTimeout(id);
  }, [query, refresh]);
  useEffect(
    () =>
      api.onThumbnail((data) => {
        setRows((old) =>
          old.map((r) =>
            r.id === data.id && r.version === data.version
              ? {
                  ...r,
                  hasThumbnail: data.ready ? 1 : 0,
                  thumbError: data.error || null,
                }
              : r,
          ),
        );
      }),
    [],
  );
  useEffect(() => {
    const onKey = (e) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === "f" &&
        !document.querySelector("dialog[open]")
      ) {
        e.preventDefault();
        document.querySelector('[aria-label="Search found files"]')?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 9000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    let current = true;
    setContentFacts(null);
    if (active)
      api
        .inspect(active.id)
        .then((f) => {
          if (current) setContentFacts(f);
        })
        .catch(() => {});
    return () => {
      current = false;
    };
  }, [active?.id]);
  const filter = (values) =>
    setQuery((q) => ({ ...q, ...values, page: 0, locationPage: 0 }));
  const openFile = (r) => {
    setActive(r);
    setCategory(r.reviewedCategory || r.category);
    setNotes(r.notes || "");
    let a = {};
    try {
      a = JSON.parse(r.analysis || "{}");
    } catch {}
    setFacts(a);
    setAiText(a.ai?.text || "");
  };
  const onFacts = async (data, id, version) => {
    if (active?.id !== id) return;
    setFacts((old) => ({ ...old, ...data }));
    if (active) await api.saveAnalysis(id, data, version).catch(() => {});
  };
  const toggle = (id) =>
    setSelected((old) => {
      const next = new Set(old);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const changeView = (value) => {
    setView(value);
    filter({ pageSize: value === "gallery" ? 24 : 150 });
    api.view(value).catch((e) => setToast(e.message));
  };
  const updateMetadata = (ids, values) =>
    run(async () => {
      await api.metadata(ids, values);
      if (active && ids.includes(active.id)) {
        const updated = await api.row(active.id);
        setActive((current) =>
          current?.id === updated?.id ? updated : current,
        );
      }
      await refresh();
      setToast("Library details saved locally.");
    });
  const favorite = (r) => updateMetadata([r.id], { favorite: !r.favorite });
  const startScan = () =>
    run(async () => {
      setSelected(new Set());
      setActive(null);
      setQuery((q) => ({
        ...q,
        page: 0,
        ...(scanMode !== catalogMode
          ? { category: "", family: "", ext: "", kind: "", collection: "" }
          : {}),
      }));
      await api.scan({ roots, archives, extras, mode: scanMode });
    });
  const showGroups = (page = 0) =>
    run(async () => {
      const result = await api.duplicateGroups(
        typeof page === "number" ? page : 0,
      );
      setGroups(result.groups);
      setGroupTotal(result.total);
      setGroupPage(typeof page === "number" ? page : 0);
      setKeepers((previous) => ({
        ...previous,
        ...Object.fromEntries(
          result.groups.map((g) => [
            g.hash,
            g.files.some((r) => r.id === previous[g.hash])
              ? previous[g.hash]
              : g.files[0].id,
          ]),
        ),
      }));
      setModal("duplicates");
    });
  const startPlan = () => {
    setPlan(null);
    setReceipt(null);
    setMode("copy");
    setModal("transfer");
  };
  const makePlan = () =>
    run(async () => {
      setPlan(
        await api.transferPlan(
          [...selected],
          destination,
          mode,
          layout,
          includeReferences,
        ),
      );
    });
  const transfer = () =>
    run(async () => {
      const result = await api.transferExecute(plan.id);
      setReceipt(result);
      setPlan(null);
      setSelected(new Set());
      if (
        active &&
        result.results.some((r) => r.id === active.id && r.status === "moved")
      )
        setActive(null);
      await refresh();
    });
  const addRoots = () =>
    run(async () => {
      const chosen = await api.chooseFolders();
      setRoots((old) => [...new Set([...old, ...chosen])]);
    });
  const sort = (column) =>
    setQuery((q) => ({
      ...q,
      sort: column,
      direction: q.sort === column && q.direction === "asc" ? "desc" : "asc",
      page: 0,
    }));
  const saveTag = () =>
    run(async () => {
      await api.annotate(active.id, category, notes);
      const updated = await api.row(active.id);
      setActive((current) => (current?.id === updated?.id ? updated : current));
      await refresh();
      setToast("Category and notes saved locally.");
    });
  const analyze = () =>
    run(async () => {
      const image = preview.current.capture();
      setAiImage(image);
      setModal("ai");
    });
  const scanStatus = running
    ? progress.phase === "files"
      ? `${count(progress.files)} files checked`
      : progress.phase === "archives"
        ? `${count(progress.archivesRead)} / ${count(progress.archiveCount)} archives`
        : progress.phase === "assetCatalog"
          ? `${count(progress.done)} / ${count(progress.total)} assets cataloged`
          : ["duplicates", "geometry"].includes(progress.phase)
            ? `${count(progress.done)} / ${count(progress.total)} files checked · ${count(progress.cached)} cached`
            : `${count(progress.done)} / ${count(progress.total)} transferred`
    : progress?.phase === "cancelled"
      ? progress.restoredPrevious
        ? "Cancelled · previous catalog restored"
        : "Cancelled · check incomplete"
      : progress?.phase === "failed"
        ? "Scan failed"
        : stats.total
          ? "Catalog saved on this PC"
          : "Ready to search";
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Box size={24} />
          </span>
          <div>
            <strong>Model Scout</strong>
            <span>
              {catalogMode === "game"
                ? "Your asset library workbench"
                : "Your 3D file workbench"}{" "}
              {info?.version ? `· v${info.version}` : ""}
            </span>
          </div>
        </div>
        <div className="top-actions">
          <span className="local-tag">
            <ShieldCheck size={14} /> Local by default
          </span>
          <button
            className="icon-button"
            aria-label="Settings"
            onClick={() => setModal("settings")}
          >
            <Settings size={20} />
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-head">
            <h2>Search locations</h2>
            <span>{roots.length}</span>
          </div>
          <p className="muted small">
            Choose any folder, drive, or network path.
          </p>
          <div className="root-list">
            {roots.map((root) => (
              <div className="root" key={root}>
                <FolderOpen size={16} />
                <span title={root}>{root}</span>
                <button
                  disabled={running}
                  aria-label={"Remove " + root}
                  onClick={() => setRoots((r) => r.filter((x) => x !== root))}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            {!roots.length && (
              <div className="no-roots">
                <FolderOpen size={25} />
                <span>Add your first search location</span>
              </div>
            )}
          </div>
          <Button
            icon={FolderPlus}
            onClick={addRoots}
            disabled={running || busy}
            className="full"
          >
            Add folders
          </Button>
          <form
            className="manual-path"
            onSubmit={(e) => {
              e.preventDefault();
              if (manualRoot.trim()) {
                setRoots((r) => [...new Set([...r, manualRoot.trim()])]);
                setManualRoot("");
              }
            }}
          >
            <input
              aria-label="Folder or drive path"
              placeholder="Or paste a path…"
              value={manualRoot}
              disabled={running}
              onChange={(e) => setManualRoot(e.target.value)}
            />
            <button
              className="icon-button"
              aria-label="Add typed path"
              disabled={!manualRoot.trim() || running}
            >
              <Check size={16} />
            </button>
          </form>
          <div className="scan-options">
            <label className="field-label">
              Search for
              <select
                aria-label="Scan mode"
                value={scanMode}
                disabled={running}
                onChange={(e) => setScanMode(e.target.value)}
              >
                <option value="models">3D models & printing files</option>
                <option value="game">Game asset library · all files</option>
              </select>
            </label>
            {scanMode === "game" && (
              <p className="tiny muted">
                Images, audio, maps, fonts, code, editor sources, licenses and
                unknown types. No extension exclusions.
              </p>
            )}
            <label className="check-label">
              <input
                type="checkbox"
                checked={archives}
                disabled={running}
                onChange={(e) => setArchives(e.target.checked)}
              />
              <span>
                Look inside archives<small>ZIP, 7z, RAR · second pass</small>
              </span>
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={extras}
                disabled={running || scanMode === "game"}
                onChange={(e) => setExtras(e.target.checked)}
              />
              <span>
                Additional CAD & slicer types
                <small>Fusion, FreeCAD, resin files, more</small>
              </span>
            </label>
          </div>
          {running ? (
            <Button
              icon={Square}
              className="full"
              onClick={() => api.cancel()}
              disabled={progress.phase === "transfer"}
            >
              Cancel search / analysis
            </Button>
          ) : (
            <Button
              icon={ScanLine}
              className="primary full"
              disabled={!roots.length || busy}
              onClick={startScan}
            >
              Search locations
            </Button>
          )}
          <div className="sidebar-rule" />
          <h2>Browse library</h2>
          <button
            className={"nav-row " + (query.kind === "unique" ? "active" : "")}
            onClick={() => filter({ kind: "unique" })}
          >
            <Files size={17} />
            <span>Unique files</span>
          </button>
          {query.kind === "unique" && (
            <p className="tiny muted">
              Only hash-confirmed copies are collapsed. Run Check duplicates or
              prepare an asset library to verify contents.
            </p>
          )}
          <button
            className={
              "nav-row " + (!query.kind && !query.collection ? "active" : "")
            }
            onClick={() => filter({ kind: "", collection: "" })}
          >
            <Files size={17} />
            <span>All files</span>
            <b>{count(stats.total)}</b>
          </button>
          <button
            className={"nav-row " + (query.kind === "archive" ? "active" : "")}
            onClick={() => filter({ kind: "archive" })}
          >
            <Archive size={17} />
            <span>Inside archives</span>
            <b>{count(stats.archived)}</b>
          </button>
          <button
            className={
              "nav-row " + (query.kind === "duplicates" ? "active" : "")
            }
            onClick={() => filter({ kind: "duplicates" })}
          >
            <Copy size={17} />
            <span>Exact duplicates</span>
            <b>{count(stats.duplicateGroups)} groups</b>
          </button>
          <div className="sidebar-rule" />
          <button
            className={
              "nav-row " + (query.kind === "favorites" ? "active" : "")
            }
            onClick={() => filter({ kind: "favorites" })}
          >
            <Star size={17} />
            <span>Favorites</span>
            <b>{count(stats.favorites)}</b>
          </button>
          <button
            className={"nav-row " + (query.kind === "untagged" ? "active" : "")}
            onClick={() => filter({ kind: "untagged" })}
          >
            <Tag size={17} />
            <span>Untagged</span>
          </button>
          <SavedSearches
            items={savedSearches}
            onLoad={(saved) =>
              filter({
                collection: "",
                ...saved,
                searchScope: saved.searchScope || "name",
                family: saved.family || "",
              })
            }
            onRemove={(name) =>
              run(async () =>
                setSavedSearches(await api.savedSearches(name, null, true)),
              )
            }
          />
          <div className="sidebar-rule" />
          <CollectionList
            items={stats.collections || []}
            current={query.collection}
            disabled={busy || running}
            onChoose={(id) =>
              filter({
                collection: id,
                kind: "",
                category: "",
                search: "",
                ext: "",
                family: "",
                tags: [],
                excludeTags: [],
              })
            }
            onEdit={(id) => {
              setCollectionEdit(id);
              setCollectionIds([]);
              setModal("collection");
            }}
          />
          <h2>Categories</h2>
          <button
            className={"category-link " + (!query.category ? "active" : "")}
            onClick={() => filter({ category: "" })}
          >
            All categories
          </button>
          <div className="categories">
            {stats.categories.map((c) => (
              <button
                key={c.category}
                className={
                  "category-link " +
                  (query.category === c.category ? "active" : "")
                }
                onClick={() => filter({ category: c.category })}
              >
                <span>{c.category}</span>
                <span>{count(c.count)}</span>
              </button>
            ))}
          </div>
          <div className="sidebar-note">
            <ShieldCheck size={17} />
            <p>
              Searching does not change your files. Review each transfer before
              it runs.
            </p>
          </div>
        </aside>
        <main className="results">
          <div className="section-heading">
            <div>
              <h1>Your files, in view.</h1>
              <p>
                {stats.total
                  ? `${count(stats.total)} files discovered · ${bytes(stats.bytes)} total`
                  : "Find scattered models. See what belongs together."}
              </p>
            </div>
            <div className="result-actions">
              <Button
                disabled={!stats.total || busy || running}
                onClick={() => setModal("assets")}
              >
                Create asset library
              </Button>
              <Button
                icon={Download}
                onClick={() =>
                  run(async () => {
                    const p = await api.exportCsv(query);
                    if (p) setToast("Inventory exported to " + p);
                  })
                }
                disabled={!stats.total || busy}
              >
                Export list
              </Button>
            </div>
          </div>
          <div className="search-tools">
            {catalogMode === "game" && (
              <select
                aria-label="File family"
                value={query.family || ""}
                onChange={(e) => filter({ family: e.target.value })}
              >
                <option value="">All file families</option>
                {(stats.families || []).map((f) => (
                  <option key={f.family} value={f.family}>
                    {f.family} ({count(f.count)})
                  </option>
                ))}
              </select>
            )}
            <div className="search-box">
              <Search size={18} />
              <input
                aria-label="Search found files"
                placeholder='Search filenames, folders and archives · "exact phrase"'
                value={query.search}
                onChange={(e) => filter({ search: e.target.value })}
              />
              {query.search && (
                <button
                  aria-label="Clear search"
                  onClick={() => filter({ search: "" })}
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <select
              aria-label="Search in"
              value={query.searchScope}
              onChange={(e) => filter({ searchScope: e.target.value })}
            >
              <option value="name">Names only</option>
              <option value="path">Paths</option>
              <option value="all">All file details</option>
            </select>
            <select
              aria-label="File type filter"
              value={query.ext}
              onChange={(e) => filter({ ext: e.target.value })}
            >
              <option value="">All formats</option>
              {stats.extensions.map((e) => (
                <option key={e.ext} value={e.ext || "(none)"}>
                  {e.ext ? "." + e.ext : "No extension"} ({e.count})
                </option>
              ))}
            </select>
          </div>
          <SearchTools
            query={query}
            onFilter={filter}
            tags={stats.tags || []}
            onSave={() => {
              setSearchName("");
              setModal("saveSearch");
            }}
          />
          {query.collection &&
            (() => {
              const item = stats.collections?.find(
                (c) => c.id === query.collection,
              );
              return (
                <div className="collection-summary">
                  <div>
                    <strong>{item?.name || "Collection unavailable"}</strong>
                    {item && (
                      <>
                        <p className="tiny">
                          {item.available} available ·{" "}
                          {item.members - item.available} outside current scan
                          {item.creator ? ` · ${item.creator}` : ""}
                        </p>
                        {item.license && (
                          <p className="tiny">License: {item.license}</p>
                        )}
                        {item.url && <p className="tiny break">{item.url}</p>}
                        {item.notes && (
                          <p className="small collection-notes">{item.notes}</p>
                        )}
                      </>
                    )}
                  </div>
                  <div>
                    <button
                      className="text-button"
                      disabled={!item || busy || running}
                      onClick={() => {
                        setCollectionEdit(item.id);
                        setCollectionIds([]);
                        setModal("collection");
                      }}
                    >
                      Edit collection
                    </button>
                    <button
                      className="text-button"
                      onClick={() => filter({ collection: "" })}
                    >
                      Leave collection
                    </button>
                  </div>
                </div>
              );
            })()}
          <div className="view-toolbar">
            <div className="view-switch" role="group" aria-label="Result view">
              <button
                aria-label="List view"
                aria-pressed={view === "list"}
                onClick={() => changeView("list")}
              >
                <List size={16} /> List
              </button>
              <button
                aria-label="Gallery view"
                aria-pressed={view === "gallery"}
                onClick={() => changeView("gallery")}
              >
                <Grid2X2 size={16} /> Gallery
              </button>
            </div>
            <label className="sort-label">
              Sort
              <select
                aria-label="Sort results"
                value={query.sort}
                onChange={(e) => filter({ sort: e.target.value })}
              >
                <option value="name">Name</option>
                <option value="size">Size</option>
                <option value="mtime">Modified</option>
                <option value="ext">Format</option>
                <option value="category">Category</option>
              </select>
              <button
                className="icon-button"
                aria-label="Reverse sort order"
                onClick={() =>
                  filter({
                    direction: query.direction === "asc" ? "desc" : "asc",
                  })
                }
              >
                {query.direction === "asc" ? "↑" : "↓"}
              </button>
            </label>
          </div>
          <div className="results-actions">
            <span>
              {count(total)} results
              {selected.size > 0 && ` · ${count(selected.size)} selected`}
            </span>
            <div>
              <button
                className="text-button"
                disabled={!total || busy}
                onClick={() =>
                  run(async () =>
                    setSelected(new Set(await api.selectAll(query))),
                  )
                }
              >
                Select all results
              </button>
              <button
                className="text-button"
                disabled={!selected.size}
                onClick={() => setSelected(new Set())}
              >
                Clear
              </button>
              <Button
                icon={Layers}
                disabled={!stats.total || running || busy}
                onClick={() => {
                  setGeometryIds([...selected]);
                  setModal("geometry");
                }}
              >
                Matching geometry
              </Button>
              <Button
                icon={Copy}
                disabled={!stats.total || running || busy}
                onClick={() =>
                  run(async () => {
                    await api.duplicates();
                  })
                }
              >
                Check duplicates
              </Button>
            </div>
          </div>
          {stats.duplicateGroups > 0 && (
            <div className="duplicate-banner">
              <Layers size={17} />
              <span>
                <strong>{stats.duplicateGroups} exact duplicate groups</strong>{" "}
                confirmed by SHA-256.
              </span>
              <button disabled={running || busy} onClick={showGroups}>
                Review copies
              </button>
            </div>
          )}
          {locations.count > 0 && (
            <section
              className="location-matches"
              aria-label="Matching folders and archives"
            >
              <div className="location-heading">
                <strong>
                  {count(locations.count)} matching folders and archives
                </strong>
                <span className="tiny muted">
                  Locations matched separately. Contents are not included
                  automatically.
                </span>
              </div>
              <ul>
                {locations.rows.map((location) => (
                  <li key={location.path}>
                    <span className="location-kind">
                      {location.kind === "folder" ? "Folder" : "Archive"}
                    </span>
                    <div>
                      <strong>{location.name}</strong>
                      <span title={location.path}>{location.path}</span>
                    </div>
                    <button
                      className="text-button"
                      aria-label={
                        (location.kind === "folder"
                          ? "Open folder "
                          : "Show archive ") + location.name
                      }
                      onClick={() =>
                        run(() => api.revealLocation(location.path))
                      }
                    >
                      {location.kind === "folder"
                        ? "Open folder"
                        : "Show in folder"}
                    </button>
                  </li>
                ))}
              </ul>
              {locations.count > locations.pageSize && (
                <div className="location-pages">
                  <button
                    disabled={locations.page === 0}
                    onClick={() =>
                      setQuery((q) => ({
                        ...q,
                        locationPage: locations.page - 1,
                      }))
                    }
                  >
                    Previous locations
                  </button>
                  <span>
                    {locations.page + 1} /{" "}
                    {Math.ceil(locations.count / locations.pageSize)}
                  </span>
                  <button
                    disabled={
                      (locations.page + 1) * locations.pageSize >=
                      locations.count
                    }
                    onClick={() =>
                      setQuery((q) => ({
                        ...q,
                        locationPage: locations.page + 1,
                      }))
                    }
                  >
                    Next locations
                  </button>
                </div>
              )}
            </section>
          )}
          <div className="table-area">
            {rows.length ? (
              view === "gallery" ? (
                <Gallery
                  rows={rows}
                  selected={selected}
                  active={active}
                  onOpen={openFile}
                  onToggle={toggle}
                  onFavorite={favorite}
                  paused={running}
                  onError={setToast}
                />
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th className="select-col">
                        <input
                          type="checkbox"
                          aria-label="Select this page"
                          checked={rows.every((r) => selected.has(r.id))}
                          onChange={(e) =>
                            setSelected((old) => {
                              const next = new Set(old);
                              rows.forEach((r) =>
                                e.target.checked
                                  ? next.add(r.id)
                                  : next.delete(r.id),
                              );
                              return next;
                            })
                          }
                        />
                      </th>
                      <th>
                        <button onClick={() => sort("name")}>
                          Name{" "}
                          {query.sort === "name"
                            ? query.direction === "asc"
                              ? "↑"
                              : "↓"
                            : ""}
                        </button>
                      </th>
                      <th className="type-col">
                        <button onClick={() => sort("ext")}>Type</button>
                      </th>
                      <th className="size-col">
                        <button onClick={() => sort("size")}>Size</button>
                      </th>
                      <th className="category-col">
                        <button onClick={() => sort("category")}>
                          Category
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        className={active?.id === r.id ? "focused" : ""}
                        onClick={() => openFile(r)}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={"Select " + r.name}
                            checked={selected.has(r.id)}
                            onChange={() => toggle(r.id)}
                          />
                        </td>
                        <td>
                          <button
                            className="filename"
                            onClick={() => openFile(r)}
                          >
                            {r.member ? (
                              <Archive size={17} />
                            ) : (
                              <Box size={17} />
                            )}
                            <span>
                              <strong>
                                {r.favorite ? "★ " : ""}
                                {r.name}
                              </strong>
                              <small
                                title={
                                  r.path + (r.member ? " :: " + r.member : "")
                                }
                              >
                                {r.member ? `${r.path} :: ${r.member}` : r.path}
                              </small>
                            </span>
                          </button>
                        </td>
                        <td>
                          <span className="extension">{r.ext || "none"}</span>
                        </td>
                        <td className="size-col">{bytes(r.size)}</td>
                        <td className="category-col">
                          <span
                            className={
                              "category-tag " +
                              (r.reviewedCategory ? "reviewed" : "")
                            }
                          >
                            {r.reviewedCategory && <Check size={12} />}{" "}
                            {r.reviewedCategory || r.category}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              <div className="empty">
                <div className="empty-art">
                  <Box size={65} strokeWidth={1.1} />
                  <Search className="empty-search" size={28} />
                </div>
                <h2>
                  {stats.total
                    ? "No matching files"
                    : "A home for every model starts here."}
                </h2>
                <p>
                  {stats.total
                    ? "Try another format, category, or search term."
                    : "Add folders or drives, then search. Your files stay exactly where they are until you choose to organize them."}
                </p>
                {!stats.total && (
                  <Button icon={FolderPlus} onClick={addRoots}>
                    Choose a search location
                  </Button>
                )}
                <div className="format-samples">
                  STL <span /> OBJ <span /> 3MF <span /> STEP <span /> BLEND{" "}
                  <span /> +19 formats
                </div>
              </div>
            )}
          </div>
          <div className="pagination">
            <label className="page-size">
              Per page{" "}
              <select
                aria-label="Results per page"
                value={query.pageSize}
                onChange={(e) => filter({ pageSize: Number(e.target.value) })}
              >
                <option value={24}>24</option>
                <option value={48}>48</option>
                {view === "list" && <option value={150}>150</option>}
              </select>
            </label>
            <span>
              {total
                ? `${query.page * query.pageSize + 1}–${Math.min((query.page + 1) * query.pageSize, total)} of ${count(total)}`
                : "No files to display"}
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="Previous page"
                disabled={query.page === 0}
                onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="icon-button"
                aria-label="Next page"
                disabled={(query.page + 1) * query.pageSize >= total}
                onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </main>
        <aside className="inspector">
          <div className="inspector-heading">
            <h2>
              {catalogMode === "game" ? "File inspector" : "Model inspector"}
            </h2>
            <Box size={18} />
          </div>
          {active ? (
            <>
              {hasRasterPreview(active) ? (
                <RasterPreview key={active.id} file={active} />
              ) : (
                <Preview ref={preview} file={active} onFacts={onFacts} />
              )}
              <div className="inspector-body">
                <span className="eyebrow">{active.family}</span>
                <h2 className="model-title">{active.name}</h2>
                <button
                  className="reveal"
                  onClick={() => run(() => api.reveal(active.id))}
                >
                  <FolderOpen size={14} />
                  Show in Explorer
                  <ExternalLink size={12} />
                </button>
                <dl className="facts">
                  <div>
                    <dt>File size</dt>
                    <dd>{bytes(active.size)}</dd>
                  </div>
                  <div>
                    <dt>Modified</dt>
                    <dd>{new Date(active.mtime).toLocaleDateString()}</dd>
                  </div>
                  {facts?.validated && (
                    <>
                      <div>
                        <dt>Meshes</dt>
                        <dd>{count(facts.meshes)}</dd>
                      </div>
                      <div>
                        <dt>Triangles</dt>
                        <dd>{count(facts.triangles)}</dd>
                      </div>
                      <div className="dimension">
                        <dt>Bounding box</dt>
                        <dd>
                          {facts.dimensions
                            .map((v) => Number(v.toPrecision(5)))
                            .join(" × ")}
                        </dd>
                        <small>{facts.units}</small>
                      </div>
                    </>
                  )}
                </dl>
                <div className="suggestion">
                  <div>
                    <Sparkles size={16} />
                    <strong>Suggested grouping</strong>
                  </div>
                  <p>{active.evidence}</p>
                  <span>{active.confidence}</span>
                </div>
                <div className="content-clues">
                  {contentFacts?.empty && (
                    <p className="warning">This file is empty.</p>
                  )}
                  {contentFacts?.facts?.length > 0 && (
                    <>
                      <strong>Clues inside the file</strong>
                      {contentFacts.facts.map((f, i) => (
                        <p key={i}>{f}</p>
                      ))}
                      <small>{contentFacts.scope}</small>
                    </>
                  )}
                  {facts?.embeddedNames?.length > 0 && (
                    <p>
                      Embedded object names: {facts.embeddedNames.join(", ")}
                    </p>
                  )}
                </div>
                <MetadataEditor
                  key={active.id + ":" + active.tags.join(",")}
                  file={active}
                  disabled={busy || running}
                  onSave={(values) => updateMetadata([active.id], values)}
                />
                {[
                  "Mesh / scene",
                  "Print instructions",
                  "Print model / project",
                  "CAD / source",
                  "3D models",
                ].includes(active.family) && (
                  <Button className="full" onClick={() => setModal("cost")}>
                    Estimate printing cost
                  </Button>
                )}
                {active.ext === "stl" && (
                  <Button
                    className="full mesh-button"
                    disabled={running}
                    onClick={() => setModal("mesh")}
                  >
                    Check mesh / edit a copy
                  </Button>
                )}
                <label className="field-label">
                  Your category
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    list="category-list"
                  />
                </label>
                <datalist id="category-list">
                  {stats.categories.map((c) => (
                    <option key={c.category} value={c.category} />
                  ))}
                </datalist>
                <label className="field-label">
                  Notes
                  <textarea
                    rows={2}
                    placeholder="Purpose, project, scale, creator…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
                <Button
                  icon={Check}
                  className="full"
                  disabled={busy}
                  onClick={saveTag}
                >
                  Save category & notes
                </Button>
                <Button
                  icon={Sparkles}
                  className="full ai-button"
                  disabled={!facts?.validated || busy}
                  onClick={analyze}
                >
                  Identify from preview
                </Button>
                {aiText && (
                  <div className="ai-result">
                    <strong>Identification suggestion · review needed</strong>
                    <p>{aiText}</p>
                  </div>
                )}
                <p className="tiny muted">
                  Identity suggestions are not proof of intended use or
                  printability.
                </p>
              </div>
            </>
          ) : (
            <div className="inspector-empty">
              <Box size={36} strokeWidth={1.25} />
              <h3>Take a closer look</h3>
              <p>
                Select a result to view its shape, file details, and suggested
                category.
              </p>
              <p className="tiny">
                Preview support varies by format. Every discovered file stays in
                your list.
              </p>
            </div>
          )}
        </aside>
      </div>
      <footer className="statusbar">
        <div className="status-line">
          {running ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <span className="status-dot" />
          )}
          <span>{scanStatus}</span>
          {(progress?.errorCount > 0 ||
            progress?.skippedLinks > 0 ||
            progress?.phase === "failed") && (
            <button
              className="text-button warning"
              onClick={() => setModal("errors")}
            >
              {count(progress.errorCount)} issues
              {progress.skippedLinks
                ? ` · ${count(progress.skippedLinks)} links skipped`
                : ""}
            </button>
          )}
        </div>
        <div className="selection-actions">
          <span>
            {selected.size
              ? `${count(selected.size)} selected`
              : "Select files to organize"}
          </span>
          <Button
            icon={Tag}
            disabled={!selected.size || running || busy}
            onClick={() => {
              setBulkTags("");
              setTagEdit("add");
              setBulkFavorite("keep");
              setModal("tags");
            }}
          >
            Tags / favorites
          </Button>
          <Button
            icon={FolderPlus}
            disabled={!selected.size || busy || running}
            onClick={() => {
              setCollectionEdit(query.collection || "");
              setCollectionIds([...selected]);
              setModal("collection");
            }}
          >
            Collection
          </Button>
          <Button
            icon={Layers}
            disabled={!selected.size || running || busy}
            onClick={() => {
              setBulkCategory("");
              setModal("bulk");
            }}
          >
            Set category
          </Button>
          <Button
            icon={ArrowRightLeft}
            className="primary"
            disabled={!selected.size || running || busy}
            onClick={startPlan}
          >
            Copy / move selected
          </Button>
        </div>
      </footer>
      {modal === "collection" && (
        <Modal title="Collection details" onClose={() => setModal(null)}>
          <CollectionEditor
            items={stats.collections || []}
            current={collectionEdit}
            ids={collectionIds}
            onError={(e) =>
              setToast(
                e.message.replace(
                  /^Error invoking remote method '[^']+': (Error: )?/,
                  "",
                ),
              )
            }
            onDone={(id) => {
              setModal(null);
              filter({
                collection: id,
                kind: "",
                category: "",
                search: "",
                ext: "",
                tags: [],
                excludeTags: [],
              });
              refresh();
            }}
          />
        </Modal>
      )}
      {modal === "saveSearch" && (
        <Modal title="Save this search" onClose={() => setModal(null)}>
          <p>
            Save these filters and sorting choices. The search always uses your
            current catalog.
          </p>
          <label className="field-label">
            Search name
            <input
              value={searchName}
              maxLength={80}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="Terrain to print"
            />
          </label>
          <div className="modal-actions">
            <Button onClick={() => setModal(null)}>Cancel</Button>
            <Button
              className="primary"
              disabled={!searchName.trim() || busy}
              onClick={() =>
                run(async () => {
                  setSavedSearches(await api.savedSearches(searchName, query));
                  setModal(null);
                  setToast("Search saved.");
                })
              }
            >
              Save search preset
            </Button>
          </div>
        </Modal>
      )}
      {modal === "geometry" && (
        <Modal
          title="Matching geometry review"
          wide
          onClose={() => setModal(null)}
        >
          <GeometryPanel
            ids={geometryIds}
            running={running || busy}
            onQueue={(ids) => {
              setSelected(new Set(ids));
              setPlan(null);
              setReceipt(null);
              setMode("move");
              setModal("transfer");
            }}
          />
        </Modal>
      )}
      {modal === "tags" && (
        <Modal title="Organize selected files" onClose={() => setModal(null)}>
          <p>
            Edit local metadata for {count(selected.size)} files. Category and
            notes are preserved.
          </p>
          <label className="field-label">
            Tag operation
            <select
              value={tagEdit}
              onChange={(e) => setTagEdit(e.target.value)}
            >
              <option value="add">Add tags</option>
              <option value="remove">Remove these tags</option>
              <option value="replace">Replace all tags</option>
            </select>
          </label>
          <label className="field-label">
            Tags for selection
            <input
              value={bulkTags}
              onChange={(e) => setBulkTags(e.target.value)}
              placeholder="Comma-separated tags"
              maxLength={3000}
            />
          </label>
          {tagEdit === "replace" && !bulkTags.trim() && (
            <p className="warning">
              This will clear all tags on the selected files.
            </p>
          )}
          <label className="field-label">
            Favorites
            <select
              value={bulkFavorite}
              onChange={(e) => setBulkFavorite(e.target.value)}
            >
              <option value="keep">Keep current favorites</option>
              <option value="yes">Add all to favorites</option>
              <option value="no">Remove all from favorites</option>
            </select>
          </label>
          <div className="modal-actions">
            <Button onClick={() => setModal(null)}>Cancel</Button>
            <Button
              className="primary"
              disabled={busy || running}
              onClick={() =>
                run(async () => {
                  await api.metadata([...selected], {
                    tags: bulkTags,
                    mode: tagEdit,
                    ...(bulkFavorite === "keep"
                      ? {}
                      : { favorite: bulkFavorite === "yes" }),
                  });
                  await refresh();
                  if (active) setActive(await api.row(active.id));
                  setModal(null);
                  setToast("Selection updated.");
                })
              }
            >
              Apply library details
            </Button>
          </div>
        </Modal>
      )}
      {modal === "assets" && (
        <Modal
          title="Create a unique asset library"
          wide
          canClose={!running}
          onClose={() => {
            if (!running) setModal(null);
          }}
        >
          <AssetLibrary
            query={query}
            running={running}
            progress={progress}
            onError={setToast}
          />
        </Modal>
      )}
      {modal === "cost" && active && (
        <Modal title="Printing cost studio" wide onClose={() => setModal(null)}>
          <CostPanel file={active} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal === "mesh" && active && (
        <Modal
          title="Mesh checks & safe edits"
          wide
          onClose={() => setModal(null)}
        >
          <MeshPanel
            file={active}
            onClose={() => setModal(null)}
            onSaved={() => refresh()}
          />
        </Modal>
      )}
      {modal === "bulk" && (
        <Modal
          title="Set category for selected files"
          onClose={() => setModal(null)}
        >
          <p>
            Apply one reviewed category to {count(selected.size)} selected
            files. Existing notes are preserved. This changes your catalog only.
          </p>
          <label className="field-label">
            Category for selection
            <input
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
            />
          </label>
          <div className="modal-actions">
            <Button onClick={() => setModal(null)}>Cancel</Button>
            <Button
              className="primary"
              disabled={!bulkCategory.trim() || busy}
              onClick={() =>
                run(async () => {
                  await api.annotateMany([...selected], bulkCategory.trim());
                  await refresh();
                  if (active) openFile(await api.row(active.id));
                  setModal(null);
                  setToast("Category applied to selected files.");
                })
              }
            >
              Apply category
            </Button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <AlertCircle size={18} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal === "settings" && (
        <Modal
          title="Local analysis & cloud identification"
          onClose={() => setModal(null)}
        >
          <p>
            All discovery, previews, tags, and duplicate checks run on this PC.
            Cloud identification runs only after you review a preview and click
            Send.
          </p>
          <label className="field-label">
            OpenAI API key
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={
                info?.hasKey
                  ? "A key is set for this session"
                  : "Paste a key to enable optional identification"
              }
            />
          </label>
          <p className="muted small">
            Stored in memory for this session only. The provider charges
            separately for API requests.
          </p>
          <label className="field-label">
            Vision model
            <input value={model} onChange={(e) => setModel(e.target.value)} />
          </label>
          <Button
            icon={Check}
            className="primary"
            onClick={() =>
              run(async () => {
                const hasKey = await api.setKey(key);
                setInfo((i) => ({ ...i, hasKey }));
                setKey("");
                setToast(
                  hasKey ? "API key set for this session." : "API key cleared.",
                );
                setModal(null);
              })
            }
          >
            Save for this session
          </Button>
          <hr />
          <p className="small">
            <strong>Archive support:</strong> ZIP built in; 7z / RAR{" "}
            {info?.sevenZip
              ? "available through installed 7-Zip"
              : "require 7-Zip"}
            .
          </p>
          <p className="small">
            <strong>Catalog and transfer logs:</strong>
            <br />
            {info?.userData}
          </p>
          <p className="small">
            <strong>Standard extensions:</strong>
            <br />
            {info?.extensions.join(", ")}
          </p>
          <p className="small">
            <strong>Additional types:</strong>
            <br />
            {info?.extraExtensions.join(", ")}
          </p>
          <hr />
          <p className="small">
            Model Scout © 2026 Big Bwain LLC · MIT. CAD import uses OpenCascade
            and occt-import-js under LGPL terms.
          </p>
          <Button
            onClick={() =>
              run(async () => {
                setLegalNotices(await api.notices());
                setModal("licenses");
              })
            }
          >
            Third-party licenses
          </Button>
        </Modal>
      )}
      {modal === "licenses" && legalNotices && (
        <Modal title="Third-party licenses" wide onClose={() => setModal(null)}>
          <pre className="license-text">
            {legalNotices.summary + "\n\n" + legalNotices.licenses}
          </pre>
        </Modal>
      )}
      {modal === "errors" && (
        <Modal title="Scan coverage & issues" onClose={() => setModal(null)}>
          <p>
            Unreadable locations and skipped links mean the inventory may be
            incomplete. Scan an accessible target directly to include linked
            locations. Nested archives are not expanded.
          </p>
          {progress?.message && <p className="warning">{progress.message}</p>}
          <p>
            {count(progress?.errorCount)} issues ·{" "}
            {count(progress?.skippedLinks)} links skipped. First 200 issues
            shown.
          </p>
          <div className="issue-list">
            {progress?.errors?.map((e, i) => (
              <div key={i}>
                <strong>{e.path}</strong>
                <p>{e.message}</p>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {modal === "duplicates" && (
        <Modal
          wide
          title="Review exact duplicate groups"
          onClose={() => setModal(null)}
        >
          <p>
            These groups have matching SHA-256 content hashes. Choose one keeper
            in each group, then queue the extras. The initial suggestion is the
            shortest source path; review it before continuing. Different exports
            and similarly shaped models are not counted as exact duplicates.
          </p>
          <div className="pagination">
            <span>
              Groups {groupPage * 50 + 1}–
              {Math.min((groupPage + 1) * 50, groupTotal)} of{" "}
              {count(groupTotal)} · choices apply to this page
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="Previous duplicate groups"
                disabled={groupPage === 0 || busy || running}
                onClick={() => showGroups(groupPage - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="icon-button"
                aria-label="Next duplicate groups"
                disabled={(groupPage + 1) * 50 >= groupTotal || busy || running}
                onClick={() => showGroups(groupPage + 1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className="duplicate-groups">
            {groups.map((g) => (
              <section className="duplicate-group" key={g.hash}>
                <div>
                  <strong>{g.count} identical copies</strong>
                  <span>{bytes(g.redundantBytes)} in extras</span>
                </div>
                {g.files.map((r) => (
                  <label key={r.id} className="keeper">
                    <input
                      type="radio"
                      name={g.hash}
                      checked={keepers[g.hash] === r.id}
                      onChange={() =>
                        setKeepers((k) => ({ ...k, [g.hash]: r.id }))
                      }
                    />
                    <span>
                      <strong>
                        {r.name}{" "}
                        {keepers[g.hash] === r.id && <em>Keep here</em>}
                      </strong>
                      <small>
                        {r.path}
                        {r.member ? " :: " + r.member : ""}
                      </small>
                    </span>
                  </label>
                ))}
              </section>
            ))}
          </div>
          <div className="modal-actions">
            <Button onClick={() => setModal(null)}>Cancel</Button>
            <Button
              icon={ArrowRightLeft}
              className="primary"
              disabled={busy || running}
              onClick={() => {
                const ids = groups.flatMap((g) =>
                  g.files
                    .filter((r) => r.id !== keepers[g.hash])
                    .map((r) => r.id),
                );
                setSelected(new Set(ids));
                setPlan(null);
                setReceipt(null);
                setMode("move");
                setModal("transfer");
              }}
            >
              Queue extras for review folder
            </Button>
          </div>
        </Modal>
      )}
      {modal === "transfer" && (
        <Modal
          wide
          title={
            receipt
              ? "Transfer results"
              : plan
                ? "Review exact transfer plan"
                : "Organize selected files"
          }
          onClose={() => {
            if (!busy) setModal(null);
          }}
        >
          {receipt ? (
            <>
              <div className="receipt-summary">
                <CheckCircle2 size={27} />
                <div>
                  <strong>
                    {
                      receipt.results.filter((r) => r.status !== "failed")
                        .length
                    }{" "}
                    of {receipt.results.length} completed
                  </strong>
                  <p>
                    Verified copies and per-file outcomes are recorded in the
                    transfer log.
                  </p>
                </div>
              </div>
              <p className="small break">Log: {receipt.journalPath}</p>
              <div className="plan-list">
                {receipt.results.map((r) => (
                  <div
                    key={r.id}
                    className={r.status === "failed" ? "blocked" : ""}
                  >
                    <strong>{r.status}</strong>
                    <span>{r.target}</span>
                    {r.message && <p>{r.message}</p>}
                  </div>
                ))}
              </div>
              <Button className="primary" onClick={() => setModal(null)}>
                Done
              </Button>
            </>
          ) : plan ? (
            <>
              <p>
                {plan.mode === "move"
                  ? "Selected model sources are removed only after verified copies. Referenced support files are copied and their originals stay in place."
                  : "Selected files are copied and verified. Originals stay in place."}{" "}
                Existing destination files will never be overwritten.
              </p>
              <div className="plan-summary">
                <strong>
                  {plan.entries.length} files · {bytes(plan.bytes)}
                </strong>
                <span>
                  {plan.entries.filter((r) => r.error).length} blocked
                </span>
              </div>
              <div className="plan-list">
                {plan.entries.map((r) => (
                  <div key={r.target} className={r.error ? "blocked" : ""}>
                    <strong>
                      {r.action || plan.mode} · {r.name}
                      {r.dependency ? " · referenced asset" : ""}
                    </strong>
                    <span>
                      From: {r.path}
                      {r.member ? " :: " + r.member : ""}
                    </span>
                    <span>To: {r.target}</span>
                    {r.error && <p className="warning">{r.error}</p>}
                    {r.warning && <p>{r.warning}</p>}
                  </div>
                ))}
              </div>
              <div className="modal-actions">
                <Button disabled={busy} onClick={() => setPlan(null)}>
                  Change options
                </Button>
                <Button
                  icon={ShieldCheck}
                  className="primary"
                  disabled={busy || plan.entries.some((r) => r.error)}
                  onClick={transfer}
                >
                  {busy
                    ? "Transferring…"
                    : `Confirm ${plan.mode} of ${plan.entries.length} files`}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p>
                Folder structure is preserved under each search root. Optional
                category folders use your reviewed categories or the visible
                suggestions. Review the exact paths on the next screen.
              </p>
              <label className="field-label">
                Destination folder
                <div className="input-with-button">
                  <input
                    placeholder="Choose a destination folder"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  />
                  <Button
                    icon={FolderOpen}
                    onClick={() =>
                      run(async () => {
                        const p = await api.chooseDestination();
                        if (p) setDestination(p);
                      })
                    }
                  >
                    Browse
                  </Button>
                </div>
              </label>
              <div className="form-row">
                <label className="field-label">
                  Action
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                  >
                    <option value="copy">Copy (keep originals)</option>
                    <option value="move">
                      Move (verify, then remove source)
                    </option>
                  </select>
                </label>
                <label className="field-label">
                  Organization
                  <select
                    value={layout}
                    onChange={(e) => setLayout(e.target.value)}
                  >
                    <option value="folders">Preserve source folders</option>
                    <option value="category">
                      Category, then source folders
                    </option>
                  </select>
                </label>
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={includeReferences}
                  onChange={(e) => setIncludeReferences(e.target.checked)}
                />
                Include declared OBJ/glTF assets
              </label>
              <p className="tiny muted">
                Review materials, textures, and buffers alongside the model.
                Missing references block the plan. Other project formats and
                archived models need manual dependency review.
              </p>
              <div className="notice">
                <ShieldCheck size={19} />
                <p>
                  Exact copies: choose a dedicated Duplicates review folder.
                  Archive entries can only be copied out. Include related
                  textures, materials, and assembly parts when organizing
                  project files. The review plan flags formats that may have
                  external dependencies.
                </p>
              </div>
              <div className="modal-actions">
                <Button onClick={() => setModal(null)}>Cancel</Button>
                <Button
                  className="primary"
                  disabled={!destination || busy}
                  onClick={makePlan}
                >
                  Review {selected.size} files
                </Button>
              </div>
            </>
          )}
        </Modal>
      )}
      {modal === "ai" && (
        <Modal
          title="Identify this rendered preview"
          onClose={() => {
            if (!busy) setModal(null);
          }}
        >
          <img className="ai-preview" src={aiImage} />
          <p>
            This sends the displayed image and file extension to OpenAI using{" "}
            <strong>{model}</strong>. Your file, filename, and local path are
            not sent. API usage may incur a charge.
          </p>
          <p className="muted small">
            Results are suggestions. A shape alone may not reveal intended use.
          </p>
          {!info?.hasKey && (
            <p className="warning">Add an API key in Settings first.</p>
          )}
          <div className="modal-actions">
            <Button disabled={busy} onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button
              icon={Sparkles}
              className="primary"
              disabled={busy || !info?.hasKey}
              onClick={() =>
                run(async () => {
                  const text = await api.ai(active.id, aiImage, model);
                  setAiText(text);
                  setModal(null);
                })
              }
            >
              {busy ? "Identifying…" : "Send preview for identification"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
