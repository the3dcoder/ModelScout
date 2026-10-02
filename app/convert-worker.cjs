const { parentPort, workerData } = require("node:worker_threads");
(async () => {
  const { buffer, name, ext } = workerData;
  if (["step", "stp", "iges", "igs"].includes(ext)) {
    const occt = await require("occt-import-js")({
      print: () => {},
      printErr: () => {},
    });
    const result = (
      ["step", "stp"].includes(ext) ? occt.ReadStepFile : occt.ReadIgesFile
    )(buffer, {
      linearUnit: "millimeter",
      linearDeflectionType: "bounding_box_ratio",
      linearDeflection: 0.002,
      angularDeflection: 0.5,
    });
    if (!result.success || !result.meshes?.length)
      throw new Error(
        "The CAD importer could not produce a mesh from this file.",
      );
    parentPort.postMessage({
      kind: "occt",
      meshes: result.meshes.map((m) => ({
        name: m.name,
        positions: new Float32Array(m.attributes.position.array),
        normals: m.attributes.normal
          ? new Float32Array(m.attributes.normal.array)
          : null,
        indices: new Uint32Array(m.index.array),
      })),
    });
  } else {
    const assimp = await require("assimpjs")({
      print: () => {},
      printErr: () => {},
    });
    const files = new assimp.FileList();
    files.AddFile(name, buffer);
    const result = assimp.ConvertFileList(files, "assjson");
    if (!result.IsSuccess() || !result.FileCount())
      throw new Error("The alternate importer could not read this model.");
    const json = JSON.parse(
      new TextDecoder().decode(result.GetFile(0).GetContent()),
    );
    parentPort.postMessage({
      kind: "assimp",
      root: json.rootnode,
      meshes: json.meshes.map((m) => ({
        positions: new Float32Array(m.vertices),
        normals: m.normals ? new Float32Array(m.normals) : null,
        indices: new Uint32Array(m.faces.filter((f) => f.length === 3).flat()),
      })),
    });
  }
})().catch((e) => parentPort.postMessage({ error: e.message }));
