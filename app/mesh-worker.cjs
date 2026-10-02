const { parentPort, workerData } = require("node:worker_threads");

function inspectTriangles(array) {
  const vertices = new Map(),
    edges = new Map(),
    faces = new Set(),
    parents = [];
  const minimum = [Infinity, Infinity, Infinity],
    maximum = [-Infinity, -Infinity, -Infinity];
  let degenerate = 0,
    duplicates = 0,
    invalid = 0,
    volume = 0;
  const root = (id) => {
    while (parents[id] !== id) {
      parents[id] = parents[parents[id]];
      id = parents[id];
    }
    return id;
  };
  const join = (a, b) => {
    a = root(a);
    b = root(b);
    if (a !== b) parents[b] = a;
  };
  const idOf = (x, y, z) => {
    const key = `${x},${y},${z}`;
    if (!vertices.has(key)) {
      const id = vertices.size;
      vertices.set(key, id);
      parents.push(id);
    }
    return vertices.get(key);
  };
  const keep = [];
  for (let i = 0; i < array.length; i += 9) {
    const v = Array.from(array.subarray(i, i + 9));
    if (!v.every(Number.isFinite)) {
      invalid++;
      continue;
    }
    for (let j = 0; j < 9; j++) {
      minimum[j % 3] = Math.min(minimum[j % 3], v[j]);
      maximum[j % 3] = Math.max(maximum[j % 3], v[j]);
    }
    const a = [v[3] - v[0], v[4] - v[1], v[5] - v[2]],
      b = [v[6] - v[0], v[7] - v[1], v[8] - v[2]];
    const cross = [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const zero = cross.every((n) => n === 0);
    if (zero) degenerate++;
    const ids = [
      idOf(...v.slice(0, 3)),
      idOf(...v.slice(3, 6)),
      idOf(...v.slice(6, 9)),
    ];
    const face = ids
      .slice()
      .sort((a, b) => a - b)
      .join(",");
    const duplicate = faces.has(face);
    if (duplicate) duplicates++;
    faces.add(face);
    keep.push({ offset: i, zero, duplicate });
    if (zero) continue;
    for (let j = 0; j < 3; j++) {
      const a = ids[j],
        b = ids[(j + 1) % 3],
        key = `${Math.min(a, b)},${Math.max(a, b)}`;
      const e = edges.get(key) || { count: 0, direction: 0 };
      e.count++;
      e.direction += a < b ? 1 : -1;
      edges.set(key, e);
      join(a, b);
    }
    volume +=
      (v[0] * (v[4] * v[8] - v[5] * v[7]) +
        v[1] * (v[5] * v[6] - v[3] * v[8]) +
        v[2] * (v[3] * v[7] - v[4] * v[6])) /
      6;
  }
  let boundaryEdges = 0,
    nonManifoldEdges = 0,
    inconsistentEdges = 0;
  for (const e of edges.values()) {
    if (e.count === 1) boundaryEdges++;
    if (e.count > 2) nonManifoldEdges++;
    if (e.count === 2 && e.direction !== 0) inconsistentEdges++;
  }
  const dimensions = minimum.map((n, i) =>
    Number.isFinite(n) ? maximum[i] - n : 0,
  );
  const components = new Set(parents.map((_, i) => root(i))).size;
  const suggestions = [];
  if (invalid)
    suggestions.push(
      "Invalid coordinates found. Re-export from the source application before editing.",
    );
  if (degenerate)
    suggestions.push("Zero-area triangles can be removed in a new copy.");
  if (duplicates)
    suggestions.push(
      "Coincident duplicate triangles can be removed in a new copy; inspect the result for intended double-sided surfaces.",
    );
  if (boundaryEdges)
    suggestions.push(
      "Open edges may represent holes or intentional openings. Review in a slicer or mesh editor; automatic hole filling is not applied.",
    );
  if (nonManifoldEdges || inconsistentEdges)
    suggestions.push(
      "Edge connectivity or winding needs review in a mesh editor. Recomputed normals alone do not fix this.",
    );
  if (components > 1)
    suggestions.push(
      "Several disconnected vertex groups were found. They may be intentional parts; review their placement in your slicer.",
    );
  if (!suggestions.length)
    suggestions.push(
      "No issues found by these basic checks. Confirm dimensions, supports and the sliced layers before printing.",
    );
  return {
    report: {
      triangles: array.length / 9,
      vertices: vertices.size,
      degenerate,
      duplicates,
      invalid,
      boundaryEdges,
      nonManifoldEdges,
      inconsistentEdges,
      components,
      dimensions,
      signedVolume: volume,
      suggestions,
      scope:
        "Exact-coordinate edge checks only. Self-intersections, non-manifold vertices, wall thickness, supports and printability are not tested. STL units are unspecified.",
    },
    keep,
  };
}
async function run() {
  const path = require("node:path");
  const { pathToFileURL } = require("node:url");
  const moduleUrl = (name) =>
    pathToFileURL(path.join(workerData.threeRoot, name)).href;
  const { STLLoader } = await import(
    moduleUrl("examples/jsm/loaders/STLLoader.js")
  );
  const { STLExporter } = await import(
    moduleUrl("examples/jsm/exporters/STLExporter.js")
  );
  const THREE = await import(moduleUrl("build/three.module.js"));
  const buffer = workerData.buffer;
  const bytes = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  if (bytes.byteLength >= 84) {
    const count = new DataView(bytes).getUint32(80, true);
    if (84 + count * 50 === bytes.byteLength && count > 500000)
      throw new Error(
        "Basic analysis supports up to 500,000 triangles. Open this larger model in your mesh editor.",
      );
  }
  const geometry = new STLLoader().parse(bytes);
  const array = geometry.attributes.position?.array;
  if (!array?.length || array.length % 9)
    throw new Error("No complete STL triangles were found.");
  if (array.length / 9 > 500000)
    throw new Error("Basic analysis supports up to 500,000 triangles.");
  const before = inspectTriangles(array);
  if (!workerData.options) return { before: before.report };
  if (before.report.invalid)
    throw new Error(
      "Re-export the model to fix invalid coordinates before editing.",
    );
  const o = workerData.options,
    filtered = [];
  for (const item of before.keep) {
    if (
      (o.removeDegenerate && item.zero) ||
      (o.removeDuplicates && item.duplicate)
    )
      continue;
    for (let j = 0; j < 9; j++) filtered.push(array[item.offset + j]);
  }
  if (!filtered.length)
    throw new Error("These changes would leave no triangles.");
  const edited = new THREE.BufferGeometry();
  edited.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(filtered, 3),
  );
  const matrix = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(...o.rotation.map((v) => (v * Math.PI) / 180), "XYZ"),
  );
  edited.applyMatrix4(matrix);
  edited.scale(o.scale / 100, o.scale / 100, o.scale / 100);
  edited.computeVertexNormals();
  const after = inspectTriangles(edited.attributes.position.array).report;
  if (after.invalid)
    throw new Error(
      "The edited coordinates exceed the STL range. Reduce the scale.",
    );
  const data = new STLExporter().parse(new THREE.Mesh(edited), {
    binary: true,
  });
  return {
    before: before.report,
    after,
    buffer: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
  };
}
run()
  .then((result) => parentPort.postMessage({ result }))
  .catch((e) => parentPort.postMessage({ error: e.message }));
