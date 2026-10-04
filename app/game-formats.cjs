const path = require("node:path");
const GROUPS = [
  [
    "Images & textures",
    "png jpg jpeg webp gif bmp tga tif tiff avif ico ktx ktx2 pvr dds basis",
  ],
  ["Vector graphics", "svg eps"],
  ["Audio", "ogg oga wav mp3 m4a aac flac opus mid midi"],
  ["Fonts", "ttf otf woff woff2 eot fnt"],
  ["Maps & atlases", "tmx tsx tmj tsj world atlas ldtk ldl spriteatlas"],
  [
    "Data & configuration",
    "json jsonl xml csv yaml yml ini toml bin meta mat asset anim controller mcmeta pal",
  ],
  ["Shaders", "glsl frag vert wgsl shader hlsl fx"],
  ["Code & web", "js mjs cjs ts jsx html htm css scss less py lua cs"],
  [
    "Editor projects",
    "ase aseprite psd psb kra ai xcf afphoto afdesign capx c3p unitypackage blend max f3d fcstd",
  ],
  ["Video & animation", "mp4 webm mov avi m4v swf"],
  ["Archives", "zip 7z rar tar gz bz2 xz"],
  ["Documentation & licenses", "txt md pdf rtf doc docx url"],
  [
    "3D models",
    "stl obj ply fbx dae 3ds gltf glb usdz step stp iges igs skp 3mf amf",
  ],
];
const FAMILIES = new Map(
  GROUPS.flatMap(([family, types]) =>
    types.split(" ").map((ext) => [ext, family]),
  ),
);
const REFERENCE_TYPES = new Set(
  "json xml tmx tsx tmj tsj world atlas fnt gltf obj mtl dae fbx html css js ts spriteatlas meta mat asset anim controller".split(
    " ",
  ),
);
const CATEGORIES = [
  ["World & terrain", /world|terrain|tile|dungeon|environment|landscape/],
  ["Characters & outfits", /character|outfit|player|hero|npc/],
  ["Monsters & creatures", /monster|creature|enemy|enemies/],
  ["Items & equipment", /item|equipment|icon|weapon|inventory/],
  ["Interface & HUD", /(?:\bui\b|hud|input|interface|button|menu)/],
  ["Effects & particles", /vfx|particle|effect/],
  ["Audio & music", /audio|music|sound|sfx/],
  ["Fonts & text", /font|text/],
  ["Maps & levels", /map|level/],
  ["Source projects & tools", /source|project|tool/],
  ["Documentation & licenses", /documentation|license|catalog/],
];
function gameDetails(name, relative) {
  const ext = path.extname(name).slice(1).toLowerCase();
  const family =
    /^(?:F\d+__)?(?:licen[cs]e|copying|copyright|readme)(?:[._-]|$)/i.test(name)
      ? "Documentation & licenses"
      : FAMILIES.get(ext) || (ext === "mtl" ? "3D materials" : "Other files");
  const folder =
    path
      .dirname(relative)
      .split(/[\\/]/)
      .find((x) => x !== "." && x !== "..") || "";
  const normalized = folder
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/^\d+\s*/, "");
  const match = CATEGORIES.find(([, re]) => re.test(normalized));
  return {
    family,
    category: match?.[0] || family,
    evidence: match
      ? `Suggested from source folder “${folder}”. File content and purpose require review.`
      : `Grouped by file extension or documentation filename; ${family === "Other files" ? "unknown files are retained for review" : "runtime compatibility is not verified"}.`,
    confidence: match ? "Low — source folder" : "Format grouping",
  };
}
module.exports = { gameDetails, REFERENCE_TYPES };
