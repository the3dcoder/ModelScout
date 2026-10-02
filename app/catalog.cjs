const { DatabaseSync } = require("node:sqlite");
const crypto = require("node:crypto");
const versionOf = (r) => `${r.size}:${r.mtime}:${r.ctime ?? ""}`;
const tagsOf = (value) =>
  [
    ...new Set(
      (Array.isArray(value) ? value : String(value || "").split(","))
        .map((v) => String(v).trim().toLowerCase().slice(0, 72))
        .filter(Boolean),
    ),
  ].slice(0, 40);
const FROM =
  " FROM files f LEFT JOIN notes n USING(id) LEFT JOIN asset_cache c ON c.id=f.id AND c.size=f.size AND c.mtime=f.mtime AND c.ctime IS f.ctime ";
const FIELDS =
  "f.*,n.category AS reviewedCategory,n.notes,COALESCE(n.tags,'[]') AS tags,COALESCE(n.favorite,0) AS favorite,c.thumbnail IS NOT NULL AS hasThumbnail,c.thumbError";
const present = (r) =>
  r && { ...r, tags: JSON.parse(r.tags || "[]"), version: versionOf(r) };
class Catalog {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL");
    const exists = this.db
      .prepare("SELECT name FROM sqlite_master WHERE name='files'")
      .get();
    if (
      exists &&
      this.db.prepare("PRAGMA user_version").get().user_version < 4 &&
      file !== ":memory:"
    ) {
      this.backupPath = `${file}.before-v4-${Date.now()}.bak`;
      this.db.prepare("VACUUM INTO ?").run(this.backupPath);
    }
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,path TEXT,member TEXT,root TEXT,name TEXT,ext TEXT,size REAL,mtime REAL,ctime REAL,family TEXT,category TEXT,evidence TEXT,confidence TEXT,preview INTEGER,hash TEXT,analysis TEXT);
      CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY,category TEXT,notes TEXT,tags TEXT NOT NULL DEFAULT '[]',favorite INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE IF NOT EXISTS asset_cache(id TEXT PRIMARY KEY,size REAL,mtime REAL,ctime REAL,hash TEXT,analysis TEXT,thumbnail BLOB,thumbError TEXT);
      CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY,name TEXT NOT NULL COLLATE NOCASE UNIQUE,creator TEXT NOT NULL DEFAULT '',license TEXT NOT NULL DEFAULT '',url TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS collection_members(collection_id TEXT NOT NULL,file_id TEXT NOT NULL,PRIMARY KEY(collection_id,file_id));
      CREATE TABLE IF NOT EXISTS geometry_cache(id TEXT PRIMARY KEY,version TEXT NOT NULL,algorithm TEXT NOT NULL,size REAL,mtime REAL,ctime REAL,signature TEXT,details TEXT,error TEXT);
      CREATE INDEX IF NOT EXISTS geometry_signature ON geometry_cache(signature);
      CREATE INDEX IF NOT EXISTS collection_files ON collection_members(file_id);
      CREATE INDEX IF NOT EXISTS files_size ON files(size);
      CREATE INDEX IF NOT EXISTS files_hash ON files(hash);
      CREATE INDEX IF NOT EXISTS files_ext ON files(ext);
      CREATE INDEX IF NOT EXISTS files_name ON files(name,id);
      CREATE INDEX IF NOT EXISTS files_mtime ON files(mtime,id);`);
    for (const [table, column, definition] of [
      ["files", "ctime", "REAL"],
      ["notes", "tags", "TEXT NOT NULL DEFAULT '[]'"],
      ["notes", "favorite", "INTEGER NOT NULL DEFAULT 0"],
    ]) {
      if (
        !this.db
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .some((c) => c.name === column)
      )
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
    // A committed snapshot survives interruption or a process exit during a rescan.
    if (this.finishScan(true)) {
      const previous = this.setting("lastScan") || {};
      this.setting("lastScan", {
        ...previous,
        running: false,
        phase: "cancelled",
        restoredPrevious: true,
      });
    }
    this.db.exec(
      "INSERT OR IGNORE INTO asset_cache(id,size,mtime,ctime,hash,analysis) SELECT id,size,mtime,ctime,hash,analysis FROM files; PRAGMA user_version=4",
    );
    this.insert = this.db.prepare(
      "INSERT OR IGNORE INTO files(id,path,member,root,name,ext,size,mtime,ctime,family,category,evidence,confidence,preview,hash,analysis) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    );
    this.cached = this.db.prepare(
      "SELECT size,mtime,ctime,hash,analysis FROM asset_cache WHERE id=?",
    );
    this.cacheInsert = this.db.prepare(
      "INSERT INTO asset_cache(id,size,mtime,ctime) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET size=excluded.size,mtime=excluded.mtime,ctime=excluded.ctime,hash=NULL,analysis=NULL,thumbnail=NULL,thumbError=NULL",
    );
  }
  flush() {
    if (this.pending) {
      this.db.exec("COMMIT");
      this.pending = 0;
    }
  }
  reset() {
    this.flush();
    this.db.exec("DELETE FROM files");
  }
  beginScan() {
    this.flush();
    this.db.exec(
      "BEGIN; DROP TABLE IF EXISTS scan_backup; CREATE TABLE scan_backup AS SELECT * FROM files; DELETE FROM files; COMMIT",
    );
  }
  finishScan(restore = false) {
    this.flush();
    if (
      this.db
        .prepare("SELECT name FROM sqlite_master WHERE name='scan_backup'")
        .get()
    ) {
      this.db.exec("BEGIN");
      try {
        if (restore)
          this.db.exec(
            "DELETE FROM files; INSERT INTO files SELECT * FROM scan_backup",
          );
        this.db.exec("DROP TABLE scan_backup; COMMIT");
        return true;
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
    }
  }
  add(row) {
    if (!this.pending) this.db.exec("BEGIN");
    const id = crypto
      .createHash("sha256")
      .update(row.path.toLowerCase() + "\0" + row.member)
      .digest("hex");
    const cached = this.cached.get(id);
    const same = cached && versionOf(cached) === versionOf(row);
    if (!same) this.cacheInsert.run(id, row.size, row.mtime, row.ctime ?? null);
    this.insert.run(
      id,
      row.path,
      row.member,
      row.root,
      row.name,
      row.ext,
      row.size,
      row.mtime,
      row.ctime ?? null,
      row.family,
      row.category,
      row.evidence,
      row.confidence,
      +row.preview,
      same ? cached.hash : null,
      same ? cached.analysis : null,
    );
    this.pending = (this.pending || 0) + 1;
    if (this.pending >= 400) this.flush();
    return id;
  }
  get(id) {
    return present(
      this.db.prepare("SELECT " + FIELDS + FROM + "WHERE f.id=?").get(id),
    );
  }
  setting(key, value) {
    if (value === undefined) {
      const r = this.db
        .prepare("SELECT value FROM settings WHERE key=?")
        .get(key);
      return r ? JSON.parse(r.value) : null;
    }
    this.db
      .prepare("INSERT OR REPLACE INTO settings VALUES(?,?)")
      .run(key, JSON.stringify(value));
  }
  filters(options = {}) {
    const clauses = [],
      params = [];
    const {
      search = "",
      ext = "",
      category = "",
      kind = "",
      tags = [],
      excludeTags = [],
      tagMode = "all",
    } = options;
    const terms =
      String(search)
        .slice(0, 500)
        .match(/"[^"]+"|\S+/g) || [];
    for (const raw of terms.slice(0, 8)) {
      const term =
        "%" + raw.replace(/^"|"$/g, "").replace(/[\\%_]/g, "\\$&") + "%";
      clauses.push(
        "(f.name LIKE ? ESCAPE '\\' OR f.path LIKE ? ESCAPE '\\' OR f.member LIKE ? ESCAPE '\\' OR COALESCE(n.notes,'') LIKE ? ESCAPE '\\' OR COALESCE(n.tags,'') LIKE ? ESCAPE '\\' OR COALESCE(n.category,f.category) LIKE ? ESCAPE '\\')",
      );
      params.push(term, term, term, term, term, term);
    }
    if (ext) {
      clauses.push("f.ext=?");
      params.push(ext);
    }
    if (category) {
      clauses.push("COALESCE(n.category,f.category)=?");
      params.push(category);
    }
    if (kind === "archive") clauses.push("f.member<>''");
    if (kind === "loose") clauses.push("f.member=''");
    if (kind === "favorites") clauses.push("n.favorite=1");
    if (kind === "untagged") clauses.push("COALESCE(n.tags,'[]')='[]'");
    if (options.collection) {
      clauses.push(
        "EXISTS (SELECT 1 FROM collection_members m WHERE m.file_id=f.id AND m.collection_id=?)",
      );
      params.push(String(options.collection));
    }
    if (kind === "duplicates")
      clauses.push(
        "f.hash IN (SELECT hash FROM files WHERE hash IS NOT NULL GROUP BY hash HAVING COUNT(*)>1)",
      );
    const include = tagsOf(tags),
      exclude = tagsOf(excludeTags);
    if (include.length) {
      clauses.push(
        "(" +
          include
            .map(
              () =>
                "EXISTS (SELECT 1 FROM json_each(COALESCE(n.tags,'[]')) WHERE value=?)",
            )
            .join(tagMode === "any" ? " OR " : " AND ") +
          ")",
      );
      params.push(...include);
    }
    for (const tag of exclude) {
      clauses.push(
        "NOT EXISTS (SELECT 1 FROM json_each(COALESCE(n.tags,'[]')) WHERE value=?)",
      );
      params.push(tag);
    }
    return {
      where: clauses.length ? " WHERE " + clauses.join(" AND ") : "",
      params,
    };
  }
  query(options = {}) {
    const { where, params } = this.filters(options);
    const column =
      {
        name: "f.name",
        size: "f.size",
        ext: "f.ext",
        path: "f.path",
        category: "COALESCE(n.category,f.category)",
        mtime: "f.mtime",
      }[options.sort] || "f.name";
    const count = this.db
      .prepare(
        "SELECT COUNT(*) AS count FROM files f LEFT JOIN notes n USING(id) " +
          where,
      )
      .get(...params).count;
    const pageSize = [24, 48, 150].includes(options.pageSize)
      ? options.pageSize
      : 150;
    const page = Math.min(
      Math.max(0, Math.floor(Number(options.page) || 0)),
      Math.max(0, Math.ceil(count / pageSize) - 1),
    );
    const rows = this.db
      .prepare(
        "SELECT " +
          FIELDS +
          FROM +
          where +
          ` ORDER BY ${column} ${options.direction === "desc" ? "DESC" : "ASC"},f.id LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, page * pageSize)
      .map(present);
    return { rows, count, page, pageSize };
  }
  stats() {
    return {
      ...this.db
        .prepare(
          "SELECT COUNT(*) AS total,COALESCE(SUM(size),0) AS bytes,SUM(member<>'') AS archived FROM files",
        )
        .get(),
      extensions: this.db
        .prepare(
          "SELECT ext,COUNT(*) AS count FROM files GROUP BY ext ORDER BY count DESC",
        )
        .all(),
      categories: this.db
        .prepare(
          "SELECT COALESCE(n.category,f.category) AS category,COUNT(*) AS count FROM files f LEFT JOIN notes n USING(id) GROUP BY COALESCE(n.category,f.category) ORDER BY category",
        )
        .all(),
      tags: this.db
        .prepare(
          "SELECT t.value AS tag,COUNT(*) AS count FROM files f JOIN notes n USING(id),json_each(n.tags) t GROUP BY t.value ORDER BY count DESC,tag",
        )
        .all(),
      favorites: this.db
        .prepare(
          "SELECT COUNT(*) AS count FROM files JOIN notes USING(id) WHERE favorite=1",
        )
        .get().count,
      thumbnails: this.db
        .prepare(
          "SELECT COUNT(*) AS count" + FROM + "WHERE c.thumbnail IS NOT NULL",
        )
        .get().count,
      duplicateGroups: this.db
        .prepare(
          "SELECT COUNT(*) AS count FROM (SELECT hash FROM files WHERE hash IS NOT NULL GROUP BY hash HAVING COUNT(*)>1)",
        )
        .get().count,
      collections: require("./collections.cjs").list(this),
    };
  }
  ids(options) {
    const { where, params } = this.filters(options);
    return this.db
      .prepare("SELECT f.id" + FROM + where + " ORDER BY f.id")
      .all(...params)
      .map((r) => r.id);
  }
  queryGeometryRows() {
    return this.db
      .prepare(
        "SELECT * FROM files WHERE ext IN ('stl','obj','ply') ORDER BY id",
      )
      .all()
      .map((r) => ({ ...r, version: versionOf(r) }));
  }
  annotate(id, category, notes) {
    if (!this.get(id)) throw new Error("File not in catalog.");
    this.db
      .prepare(
        "INSERT INTO notes(id,category,notes) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET category=excluded.category,notes=excluded.notes",
      )
      .run(
        id,
        String(category || "Uncategorized").slice(0, 100),
        String(notes || "").slice(0, 4000),
      );
  }
  metadata(ids, values) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 10000)
      throw new Error("Choose 1–10,000 files.");
    if (
      !values ||
      !["add", "remove", "replace", undefined].includes(values.mode)
    )
      throw new Error("Invalid tag edit.");
    this.flush();
    const rows = [...new Set(ids)].map((id) => {
      const r = this.get(id);
      if (!r) throw new Error("File no longer in catalog.");
      return r;
    });
    const supplied = tagsOf(values.tags);
    const update = this.db.prepare(
      "INSERT INTO notes(id,tags,favorite) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET tags=excluded.tags,favorite=excluded.favorite",
    );
    this.db.exec("BEGIN");
    try {
      for (const r of rows) {
        const tags =
          values.tags === undefined
            ? r.tags
            : values.mode === "remove"
              ? r.tags.filter((t) => !supplied.includes(t))
              : values.mode === "replace"
                ? supplied
                : tagsOf([...r.tags, ...supplied]);
        update.run(
          r.id,
          JSON.stringify(tags),
          typeof values.favorite === "boolean" ? +values.favorite : r.favorite,
        );
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return rows.length;
  }
  analysis(id, value, version) {
    const r = this.get(id);
    if (!r || (version && version !== r.version)) return false;
    this.ensureCache(r);
    const merged = JSON.stringify({
      ...JSON.parse(r.analysis || "{}"),
      ...value,
    });
    this.db.prepare("UPDATE files SET analysis=? WHERE id=?").run(merged, id);
    this.db
      .prepare("UPDATE asset_cache SET analysis=? WHERE id=?")
      .run(merged, id);
    return true;
  }
  setHash(id, hash) {
    const r = this.get(id);
    if (!r) return;
    this.ensureCache(r);
    this.db.prepare("UPDATE files SET hash=? WHERE id=?").run(hash, id);
    this.db.prepare("UPDATE asset_cache SET hash=? WHERE id=?").run(hash, id);
  }
  thumbnail(id) {
    return this.db.prepare("SELECT c.thumbnail" + FROM + "WHERE f.id=?").get(id)
      ?.thumbnail;
  }
  saveThumbnail(id, version, buffer, error = null) {
    const r = this.get(id);
    if (r?.version !== version) return false;
    this.ensureCache(r);
    this.db
      .prepare("UPDATE asset_cache SET thumbnail=?,thumbError=? WHERE id=?")
      .run(buffer, error, id);
    return true;
  }
  ensureCache(row) {
    const cached = this.cached.get(row.id);
    if (!cached || versionOf(cached) !== row.version)
      this.cacheInsert.run(row.id, row.size, row.mtime, row.ctime ?? null);
  }
  relocate(id, destination) {
    const next = crypto
      .createHash("sha256")
      .update(destination.toLowerCase() + "\0")
      .digest("hex");
    this.flush();
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          "INSERT OR REPLACE INTO notes(id,category,notes,tags,favorite) SELECT ?,category,notes,tags,favorite FROM notes WHERE id=?",
        )
        .run(next, id);
      this.db
        .prepare(
          "INSERT OR IGNORE INTO collection_members SELECT collection_id,? FROM collection_members WHERE file_id=?",
        )
        .run(next, id);
      this.db.prepare("DELETE FROM collection_members WHERE file_id=?").run(id);
      this.db.prepare("DELETE FROM files WHERE id=?").run(id);
      const estimate = this.setting("cost:" + id);
      if (estimate) this.setting("cost:" + next, estimate);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  savedSearches(name, options, remove = false) {
    let saved = this.setting("savedSearches") || [];
    if (name === undefined) return saved;
    name = String(name).trim().slice(0, 80);
    if (!name) throw new Error("Give this search a name.");
    saved = saved.filter((s) => s.name !== name);
    if (!remove) {
      if (saved.length >= 50) throw new Error("Keep up to 50 saved searches.");
      const query = {};
      for (const k of [
        "search",
        "ext",
        "category",
        "kind",
        "sort",
        "direction",
        "tagMode",
        "collection",
      ])
        query[k] = String(options?.[k] || "").slice(0, 500);
      query.tags = tagsOf(options?.tags);
      query.excludeTags = tagsOf(options?.excludeTags);
      saved.push({ name, query });
    }
    this.setting("savedSearches", saved);
    return saved;
  }
  close() {
    this.flush();
    this.db.close();
  }
}
module.exports = { Catalog, versionOf, tagsOf };
