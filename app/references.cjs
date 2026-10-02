const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createReadStream } = require("node:fs");
const { createInterface } = require("node:readline");
const IMAGE = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "bmp",
  "tga",
  "tif",
  "tiff",
  "dds",
  "hdr",
  "exr",
  "ktx",
  "ktx2",
  "basis",
]);
const MAX_REFERENCES = 256;
let loader;
async function mtlLoader() {
  if (!loader) {
    const root = path
      .dirname(path.dirname(require.resolve("three")))
      .replace("app.asar", "app.asar.unpacked");
    loader = import(
      pathToFileURL(path.join(root, "examples/jsm/loaders/MTLLoader.js")).href
    );
  }
  return (await loader).MTLLoader;
}

// Only declared local assets are included. A model never grants access outside its search root.
async function dependencies(row) {
  const { unchanged, inside, rejectLinks } = require("./files.cjs");
  if (!["obj", "gltf"].includes(row.ext)) return null;
  if (row.member)
    throw new Error(
      "Extract this archive model before including its referenced assets.",
    );
  const found = new Map();
  const verify = async (file) => {
    await rejectLinks(path.dirname(file));
  };
  const readText = async (item, max) => {
    await verify(item.path);
    await unchanged(item);
    if (item.size > max)
      throw new Error(`Reference inspection limit exceeded for ${item.name}.`);
    const text = await fs.readFile(item.path, "utf8");
    await unchanged(item);
    return text.replace(/^\uFEFF/, "");
  };
  const add = async (reference, parent, type, uri = false) => {
    if (typeof reference !== "string" || !reference.trim())
      throw new Error("Empty or invalid asset reference.");
    if (uri && /^data:/i.test(reference)) return null;
    let name = reference.trim();
    if (uri) {
      if (/[?#]/.test(name))
        throw new Error(
          `URL query/fragment references need manual review: ${name}`,
        );
      try {
        name = decodeURIComponent(name);
      } catch {
        throw new Error("Invalid encoded asset path.");
      }
    }
    name = name.replaceAll("\\", "/");
    if (
      /[:\x00-\x1f]/.test(name) ||
      path.posix.isAbsolute(name) ||
      path.win32.isAbsolute(name)
    )
      throw new Error(
        `Only relative local asset paths are supported: ${reference}`,
      );
    const file = path.resolve(path.dirname(parent), name);
    if (!inside(row.root, file))
      throw new Error(`Asset leaves the search root: ${reference}`);
    const ext = path.extname(file).slice(1).toLowerCase();
    if (
      !(type === "material"
        ? ext === "mtl"
        : type === "buffer"
          ? ext === "bin"
          : IMAGE.has(ext))
    )
      throw new Error(`Unsupported ${type} asset type: ${reference}`);
    await verify(file);
    const stat = await fs.lstat(file).catch(() => {
      throw new Error(`Missing referenced asset: ${reference}`);
    });
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error(`Asset is not a regular file: ${reference}`);
    const id = file.toLowerCase();
    if (found.has(id)) return found.get(id);
    if (found.size >= MAX_REFERENCES)
      throw new Error(
        "Too many referenced assets; split this transfer into smaller projects.",
      );
    const asset = {
      ...row,
      path: file,
      name: path.basename(file),
      ext,
      member: "",
      size: stat.size,
      mtime: stat.mtimeMs,
      ctime: stat.ctimeMs,
      dependency: true,
    };
    found.set(id, asset);
    return asset;
  };
  if (row.ext === "gltf") {
    const document = JSON.parse(await readText(row, 16 * 1024 * 1024));
    if (document.asset?.version !== "2.0")
      throw new Error("Referenced assets require glTF 2.0.");
    // Extension-specific references cannot be inferred safely from arbitrary JSON.
    const supported = new Set([
      "KHR_materials_unlit",
      "KHR_materials_pbrSpecularGlossiness",
      "KHR_materials_clearcoat",
      "KHR_materials_transmission",
      "KHR_materials_volume",
      "KHR_materials_ior",
      "KHR_materials_sheen",
      "KHR_materials_specular",
      "KHR_materials_iridescence",
      "KHR_materials_anisotropy",
      "KHR_materials_emissive_strength",
      "KHR_texture_transform",
      "KHR_texture_basisu",
      "EXT_texture_webp",
      "KHR_mesh_quantization",
      "KHR_draco_mesh_compression",
      "EXT_meshopt_compression",
      "EXT_mesh_gpu_instancing",
      "KHR_lights_punctual",
    ]);
    if ((document.extensionsUsed || []).some((name) => !supported.has(name)))
      throw new Error(
        "This glTF uses an extension whose asset references need manual review.",
      );
    for (const buffer of document.buffers || [])
      if (buffer.uri !== undefined)
        await add(buffer.uri, row.path, "buffer", true);
    for (const image of document.images || [])
      if (image.uri !== undefined)
        await add(image.uri, row.path, "image", true);
  } else {
    await verify(row.path);
    await unchanged(row);
    if (row.size > 128 * 1024 * 1024)
      throw new Error("OBJ reference inspection is limited to 128 MiB.");
    const stream = createReadStream(row.path, { encoding: "utf8" });
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    const materials = [];
    try {
      for await (const line of lines) {
        const match = /^\s*mtllib\s+(.+?)\s*$/i.exec(line);
        if (!match) continue;
        const text = match[1].replace(/\s+#.*$/, "");
        // A single filename may contain spaces. Prefer that exact existing path.
        const whole = path.resolve(path.dirname(row.path), text);
        const exact =
          inside(row.root, whole) &&
          !/[:\x00-\x1f]/.test(text) &&
          (await fs.lstat(whole).then(
            (s) => s.isFile(),
            () => false,
          ));
        const names = exact
          ? [text]
          : (text.match(/"[^"]+"|\S+/g) || []).map((v) =>
              v.replace(/^"|"$/g, ""),
            );
        for (const name of names)
          materials.push(await add(name, row.path, "material"));
      }
    } finally {
      lines.close();
      stream.destroy();
    }
    await unchanged(row);
    const MTLLoader = await mtlLoader();
    for (const material of new Set(materials)) {
      const creator = new MTLLoader().parse(
        await readText(material, 4 * 1024 * 1024),
        "",
      );
      for (const info of Object.values(creator.materialsInfo)) {
        for (const [key, value] of Object.entries(info)) {
          if (!/^(map_|bump$|norm$|disp$|decal$|refl$)/i.test(key)) continue;
          const texture = creator
            .getTextureParams(value, {})
            .url.replace(/^"|"$/g, "");
          if (texture.startsWith("-"))
            throw new Error(
              "An unsupported material texture option needs manual review.",
            );
          await add(texture, material.path, "image");
        }
      }
    }
  }
  return [...found.values()];
}
module.exports = { dependencies };
