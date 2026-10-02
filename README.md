# Model Scout

A local Windows workbench for finding, previewing, and organizing 3D models and printing files.

Search folders or drives, browse a cached gallery, keep multi-part projects together, and review exactly what will be copied or moved. Model Scout also includes filament and resin cost profiles and basic STL inspection and editing.

## Run it

Use Windows 10/11 x64. Build the release ZIP with the commands below, or download a published build when one is available under [Releases](https://github.com/the3dcoder/ModelScout/releases). Extract the complete ZIP and run **Model-Scout-0.4.0.exe**. No installer is required. The current build is unsigned.

The portable executable stores its catalog, thumbnails, profiles, and transfer logs in `%APPDATA%\Model Scout`. Back up that folder while the app is closed if you want to preserve your library metadata. Source models stay in their original folders until you confirm a move.

To run from source, install Node.js 24.15 or newer and Git:

```powershell
npm ci
npm start
```

## Organize a library

1. Add search folders or drives. ZIP scanning is optional; 7z and RAR additionally require a local [7-Zip installation](https://www.7-zip.org/).
2. Search names, paths, tags, notes, and categories. Combine tags with all/any/exclude filters, mark favorites, and save searches.
3. Switch between the list and gallery. Thumbnails are generated for visible cards and cached; **Prepare this page** is an explicit background action.
4. Select related files and choose **Collection**. Keep creator, source link, license notes, and project notes with the set. One file can belong to several collections. Membership survives rescans; unavailable files are counted separately.
5. Run **Check duplicates**. Exact matches use SHA-256 after size filtering. Choose a keeper and review moving extras to a separate folder.
6. Use **Matching geometry** to compare selected STL, OBJ, and PLY files, or all supported files in the current catalog. Compare candidates in paired previews, keep at least one file per group, and explicitly select extras for transfer review.
7. Choose **Copy / move selected**, set a destination, and review the file-by-file plan. Existing files are never overwritten. Every copy is verified before a moved source is removed.

Category organization retains the original search-root folder, subfolders, and filenames. Collections are virtual groups, so adding a file to one does not move it. After an in-app move, scan the destination to see that file again with its collection, tags, favorites, notes, and saved cost estimate. The estimate retains its original fingerprint and may need review.

Geometry comparison matches the same triangles at a fixed precision of 0.00001 model units. It ignores placement, vertex/triangle order, winding, normals, colors, and materials, while preserving scale and orientation. Units and intended use are not compared. Rotation, different triangulation, or precision differences may miss matches. These are review candidates, distinct from byte-identical duplicates; no file is automatically selected or removed. Processing is local and bounded to 64 MiB, 500,000 triangles, and 45 seconds per file. Completed results and failures are cached for unchanged files; cancel and resume, or explicitly retry failures. Groups are paged, with up to 80 files shown in each group.

**Include declared OBJ/glTF assets** adds supported local material, texture, and buffer references to the review plan. Shared support files are copied once per destination and their originals remain in place, even during a model move. Missing or unsafe references block the plan. Other project formats, extension-specific glTF references, and archive-contained projects may need manual review. External assets are preserved during transfer; previews do not fetch those textures or buffers.

## Printing costs

Use filament or resin profiles with your own material prices, printer power and purchase cost, equipment lifetime, maintenance, electricity, labor, failure allowance, consumables, finishing, packaging, and target margin. Resin profiles also cover wash/cure equipment and consumables.

Enter whole-job time and material from your slicer, or import supported text G-code comments. Export/import Model Scout profiles as versioned JSON. Estimates retain their inputs and file version. Omitted rates are flagged; example/default values are not market prices. Vendor printer profiles and proprietary resin job formats are not imported automatically. A mesh volume alone cannot establish realistic printing time or material use.

## Model inspection and editing

STL tools report bounds, triangles, degenerate/duplicate faces, boundary and non-manifold edges, components, winding, and signed volume. Uniform scale, XYZ rotation, and removal of zero-area or duplicate triangles produce a preview and a **new STL file** with a verification receipt.

These are basic diagnostics, not a printability guarantee. They do not detect all self-intersections, thin walls, unsupported overhangs, or non-manifold vertices. STL has no inherent units; confirm the input units in your slicer. Editing is bounded to 64 MiB and 500,000 triangles. Export discards color/materials because STL cannot preserve them.

## Supported discovery formats

`stl obj 3mf amf gcode ply fbx dae blend step stp iges igs skp sldprt sldasm scad g gco cff 3ds gltf glb usdz`

An optional extended set adds more CAD and slicer formats. Discovery, validity, preview support, and purpose identification are separate capabilities. Unsupported previews remain searchable and transferable. File/path categories are suggestions; dimensions and geometry do not establish what an object is for.

## Privacy

Scanning, hashing, thumbnails, costs, and mesh tools run locally. There is no telemetry, account requirement, or automatic upload. Optional **cloud identification** sends only the explicitly reviewed rendered PNG and file extension to OpenAI. It requires a user-supplied API key kept in memory for the session, incurs provider charges, and produces suggestions that need review. Models and local paths are not included in that request. See [PRIVACY.md](PRIVACY.md).

## Development and releases

```powershell
npm test
npm run build
npm run test:app
npm run format:check
npm run package
npm run test:packaged
npm run release:bundle
```

Tests use generated fixtures and isolated profiles. They do not use a personal model library. The public release ZIP includes the executable, licenses, and corresponding source snapshots for the native importers. Distribute that complete ZIP. See [CONTRIBUTING.md](CONTRIBUTING.md), [verification](docs/VERIFICATION.md), and [importer build instructions](docs/BUILD_IMPORTERS.md).

Current limits: Windows x64 is the tested target; nested archives are not expanded; preview reads stop at 128 MiB; complex CAD/native application files may require their original software. Transfers are logged but do not have automatic undo. Scans skip symbolic links and junctions inside the search tree. Shape similarity, advanced mesh repair, website synchronization, and direct slicer integrations remain [future work](docs/FEATURE_RESEARCH.md).

## License and credits

Model Scout's original code is [MIT licensed](LICENSE). Electron, React, Three.js, SQLite, Lucide, yauzl, AssimpJS, and OpenCascade provide the underlying runtime, interface, parsing, and conversion tools. Their licenses remain separate, including LGPL terms for the CAD importer. See [third-party components](docs/THIRD_PARTY.md) and [runtime notices](notices/RUNTIME-NOTICES.txt).
