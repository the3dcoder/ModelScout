const path = require("node:path");
const EXTENSIONS = [
  "stl",
  "obj",
  "3mf",
  "amf",
  "gcode",
  "ply",
  "fbx",
  "dae",
  "blend",
  "step",
  "stp",
  "iges",
  "igs",
  "skp",
  "sldprt",
  "sldasm",
  "scad",
  "g",
  "gco",
  "cff",
  "3ds",
  "gltf",
  "glb",
  "usdz",
];
const EXTRA_EXTENSIONS = [
  "f3d",
  "f3z",
  "fcstd",
  "ipt",
  "iam",
  "max",
  "3dxml",
  "wrl",
  "off",
  "ctb",
  "chitubox",
  "lys",
  "lyt",
  "bgcode",
];
const MESH = new Set([
  "stl",
  "obj",
  "ply",
  "fbx",
  "dae",
  "3ds",
  "gltf",
  "glb",
  "usdz",
  "off",
  "wrl",
]);
const PRINT = new Set([
  "gcode",
  "gco",
  "bgcode",
  "ctb",
  "chitubox",
  "lys",
  "lyt",
]);
const PREVIEW = new Set([
  "stl",
  "obj",
  "ply",
  "3mf",
  "amf",
  "fbx",
  "dae",
  "3ds",
  "gltf",
  "glb",
  "step",
  "stp",
  "iges",
  "igs",
]);
function family(ext) {
  return PRINT.has(ext)
    ? "Print instructions"
    : MESH.has(ext)
      ? "Mesh / scene"
      : ["3mf", "amf"].includes(ext)
        ? "Print model / project"
        : ["g", "cff"].includes(ext)
          ? "Unverified format"
          : "CAD / source";
}
function suggest(name, folder = "") {
  const text = `${name} ${folder}`.toLowerCase().replace(/[_-]/g, " ");
  const rules = [
    [
      "Model railways",
      /\b(railway|railroad|locomotive|train|boxcar|o scale|ho scale)\b/,
    ],
    ["Geocaching", /\b(geocach\w*|cache container|cache holder)\b/],
    [
      "Workshop & hardware",
      /\b(bracket|mount|hinge|bolt|nut|washer|clamp|jig|adapter|bearing|gear)\b/,
    ],
    [
      "Home & organization",
      /\b(organizer|storage|drawer|shelf|hook|holder|vase|planter|lamp)\b/,
    ],
    [
      "Miniatures & games",
      /\b(miniature|dragon|dungeon|tabletop|figurine|chess|dice|terrain)\b/,
    ],
    ["Fitness", /\b(gym|fitness|barbell|dumbbell|weight rack)\b/],
    [
      "Vehicles",
      /\b(car|truck|aircraft|airplane|boat|vehicle|wheel|chassis)\b/,
    ],
  ];
  for (const [category, re] of rules) {
    const match = text.match(re);
    if (match)
      return {
        category,
        evidence: `Name or folder contains “${match[0]}”; object identity not verified.`,
        confidence: "Low — name / folder",
      };
  }
  return {
    category: "Uncategorized",
    evidence:
      "No reliable purpose identified. Review the preview or add your own category.",
    confidence: "Unknown",
  };
}
function fileRecord(filePath, stat, root, member = "", mode = "models") {
  const name = member
    ? path.posix.basename(member.replaceAll("\\", "/"))
    : path.basename(filePath);
  const ext = path.extname(name).slice(1).toLowerCase();
  const guessed =
    mode === "game"
      ? require("./game-formats.cjs").gameDetails(
          name,
          member || path.relative(root, filePath),
        )
      : suggest(
          name,
          member ? path.posix.dirname(member) : path.dirname(filePath),
        );
  return {
    path: filePath,
    member,
    root,
    name,
    ext,
    size: stat.size,
    mtime: stat.mtimeMs,
    ctime: stat.ctimeMs ?? null,
    family: family(ext),
    ...guessed,
    preview: PREVIEW.has(ext),
  };
}
module.exports = {
  EXTENSIONS,
  EXTRA_EXTENSIONS,
  PREVIEW,
  family,
  suggest,
  fileRecord,
};
