const { randomUUID } = require("node:crypto");

function list(catalog) {
  return catalog.db
    .prepare(
      `SELECT c.*,COUNT(m.file_id) AS members,
    COUNT(f.id) AS available FROM collections c
    LEFT JOIN collection_members m ON m.collection_id=c.id
    LEFT JOIN files f ON f.id=m.file_id
    GROUP BY c.id ORDER BY c.name COLLATE NOCASE`,
    )
    .all();
}
function get(catalog, id) {
  const item = catalog.db
    .prepare("SELECT * FROM collections WHERE id=?")
    .get(id);
  if (!item) throw new Error("Collection no longer exists.");
  return item;
}
function save(catalog, value) {
  if (!value || typeof value !== "object")
    throw new Error("Invalid collection.");
  const name = String(value.name || "")
    .trim()
    .slice(0, 100);
  if (!name) throw new Error("Give the collection a name.");
  const url = String(value.url || "")
    .trim()
    .slice(0, 2000);
  if (url && !/^https?:\/\//i.test(url))
    throw new Error("Source link must start with https:// or http://.");
  if (url) {
    try {
      new URL(url);
    } catch {
      throw new Error("Enter a valid source link.");
    }
  }
  const id = value.id || randomUUID();
  if (value.id) get(catalog, id);
  const duplicate = catalog.db
    .prepare("SELECT id FROM collections WHERE name=? AND id<>?")
    .get(name, id);
  if (duplicate) throw new Error("A collection with that name already exists.");
  catalog.db
    .prepare(
      `INSERT INTO collections(id,name,creator,license,url,notes) VALUES(?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,creator=excluded.creator,
    license=excluded.license,url=excluded.url,notes=excluded.notes`,
    )
    .run(
      id,
      name,
      String(value.creator || "")
        .trim()
        .slice(0, 200),
      String(value.license || "")
        .trim()
        .slice(0, 300),
      url,
      String(value.notes || "").slice(0, 4000),
    );
  return id;
}
function members(catalog, id, ids, remove = false) {
  get(catalog, id);
  if (!Array.isArray(ids) || !ids.length || ids.length > 10000)
    throw new Error("Choose 1–10,000 files.");
  const unique = [...new Set(ids)];
  if (!remove && unique.some((file) => !catalog.get(file)))
    throw new Error("File no longer in catalog.");
  catalog.flush();
  const statement = catalog.db.prepare(
    remove
      ? "DELETE FROM collection_members WHERE collection_id=? AND file_id=?"
      : "INSERT OR IGNORE INTO collection_members VALUES(?,?)",
  );
  catalog.db.exec("BEGIN");
  try {
    for (const file of unique) statement.run(id, file);
    catalog.db.exec("COMMIT");
  } catch (error) {
    catalog.db.exec("ROLLBACK");
    throw error;
  }
  return list(catalog);
}
function remove(catalog, id) {
  get(catalog, id);
  catalog.flush();
  catalog.db.exec("BEGIN");
  try {
    catalog.db
      .prepare("DELETE FROM collection_members WHERE collection_id=?")
      .run(id);
    catalog.db.prepare("DELETE FROM collections WHERE id=?").run(id);
    catalog.db.exec("COMMIT");
  } catch (error) {
    catalog.db.exec("ROLLBACK");
    throw error;
  }
  return list(catalog);
}
module.exports = { list, save, members, remove };
