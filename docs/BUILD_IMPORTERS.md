# Building and replacing the importers

The release ZIP includes complete source snapshots for the WebAssembly importers
and their C++ libraries. `manifest.json` records exact commits, archive hashes,
and the hashes of the shipped WASM files. Release preparation verifies the WASM
against the binary at each pinned upstream revision.

## OpenCascade / occt-import-js

1. Extract the `occt-import-js` source archive. Extract the OCCT source archive
   into its `occt` directory, removing the archive's outer directory so that
   `occt/src` exists.
2. On Windows, install CMake and the compiler requirements described in the
   included upstream README. Run `tools/setup_emscripten_win.bat`; the pinned
   wrapper requests Emscripten 3.1.69 and MinGW 7.1.0.
3. Run `tools/build_wasm_win_release.bat`, then
   `tools/build_wasm_win_dist.bat`, following the wrapper's own build scripts.
4. Replace both `dist/occt-import-js.js` and `dist/occt-import-js.wasm` in
   `node_modules/occt-import-js` in a Model Scout source checkout. Run
   `npm run build` and `npm start` to use the replacement.

## Assimp / assimpjs

Extract the assimpjs archive, then the Assimp archive into its `assimp` directory.
Follow its included `tools/setup_emscripten_win.bat` and WASM build scripts.
Replace the JS and WASM pair in `node_modules/assimpjs/dist`.

In an unpacked application, the replaceable modules are under
`resources/app.asar.unpacked/node_modules`. The portable launcher extracts its
contents to a temporary folder; use the source checkout or an unpacked build for
a persistent replacement. Compatible interfaces are required. Model Scout does
not restrict modification or reverse engineering of these components for debugging.

`npm run release:bundle` assembles the source snapshots and notices with the
portable executable. Distribute the complete ZIP, or offer the source directory
with equivalent access alongside the executable. Updating either importer requires
updating and verifying its source and submodule revisions in that script.

Source snapshots and build instructions are included; the original upstream
toolchains have not been rebuilt as part of Model Scout's application tests.
