const { parentPort, workerData } = require("node:worker_threads");
const { createHash } = require("node:crypto");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

(async () => {
  const load = (name) =>
    import(
      pathToFileURL(
        path.join(
          workerData.threeRoot,
          "examples/jsm/loaders",
          name + "Loader.js",
        ),
      ).href
    );
  const data = workerData.buffer;
  const bytes = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  );
  const geometries = [];
  if (workerData.ext === "obj") {
    const { OBJLoader } = await load("OBJ");
    const object = new OBJLoader().parse(new TextDecoder().decode(bytes));
    object.traverse((node) => {
      if (node.isMesh) geometries.push(node.geometry);
      else if (node.isLine || node.isPoints)
        throw new Error("Non-triangle OBJ data needs manual review.");
    });
  } else {
    const type = workerData.ext === "stl" ? "STL" : "PLY";
    const module = await load(type);
    let geometry;
    try {
      geometry = new module[type + "Loader"]().parse(bytes);
    } catch {
      throw new Error(
        `Could not parse ${type} triangle geometry. Check the file in its source application.`,
      );
    }
    if (workerData.ext === "ply" && !geometry.index)
      throw new Error("PLY point clouds are not triangle meshes.");
    geometries.push(geometry);
  }
  let triangles = 0;
  const minimum = [Infinity, Infinity, Infinity],
    maximum = [-Infinity, -Infinity, -Infinity];
  for (const geometry of geometries) {
    const positions = geometry.getAttribute("position");
    const count = geometry.index?.count ?? positions?.count;
    if (!positions || !count || count % 3)
      throw new Error("No complete triangles found.");
    triangles += count / 3;
    if (triangles > 500000)
      throw new Error(
        "Geometry comparison supports up to 500,000 triangles per file.",
      );
    for (let j = 0; j < count; j++) {
      const id = geometry.index ? geometry.index.getX(j) : j;
      if (!Number.isInteger(id) || id < 0 || id >= positions.count)
        throw new Error("Invalid mesh index.");
      const values = [
        positions.getX(id),
        positions.getY(id),
        positions.getZ(id),
      ];
      if (!values.every(Number.isFinite))
        throw new Error("Invalid mesh coordinates.");
      values.forEach((value, axis) => {
        minimum[axis] = Math.min(minimum[axis], value);
        maximum[axis] = Math.max(maximum[axis], value);
      });
    }
  }
  if (!triangles) throw new Error("No triangle geometry found.");
  const dimensions = minimum.map((value, i) => maximum[i] - value);
  // Fixed model-unit precision preserves scale; min-corner translation removes placement differences.
  // Triangle and vertex order, winding, normals, colors, and materials are deliberately excluded.
  const canonical = [],
    quantize = (value) => {
      const number = Math.round(value * 100000);
      if (!Number.isSafeInteger(number))
        throw new Error("Coordinates exceed comparison precision limits.");
      return number;
    };
  for (const geometry of geometries) {
    const positions = geometry.getAttribute("position"),
      count = geometry.index?.count ?? positions.count;
    for (let j = 0; j < count; j += 3) {
      const vertices = [];
      for (let k = 0; k < 3; k++) {
        const id = geometry.index ? geometry.index.getX(j + k) : j + k;
        vertices.push(
          [positions.getX(id), positions.getY(id), positions.getZ(id)]
            .map((n, axis) => quantize(n - minimum[axis]))
            .join(","),
        );
      }
      canonical.push(vertices.sort().join(";"));
    }
  }
  canonical.sort();
  const hash = createHash("sha256").update("triangle-v1\0" + triangles + "\0");
  for (const face of canonical) hash.update(face + "\n");
  parentPort.postMessage({
    result: {
      signature: hash.digest("hex"),
      triangles,
      dimensions,
      precision: 0.00001,
    },
  });
})().catch((error) => parentPort.postMessage({ error: error.message }));
