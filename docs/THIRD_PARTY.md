# Third-party components

Model Scout's original source is MIT licensed. This does not relicense its dependencies or user models.

| Component | License | Role |
| --- | --- | --- |
| Electron | MIT, with Chromium's separate notices | Desktop runtime |
| React / React DOM | MIT | Interface |
| Three.js | MIT | Rendering, loaders, MTL parsing, STL export |
| Lucide | ISC | Icons |
| SQLite | Public domain | Local catalog |
| yauzl and its dependencies | MIT | ZIP reading |
| assimpjs | MIT | JavaScript/WASM conversion wrapper |
| Assimp | BSD 3-Clause | Native model import |
| occt-import-js | LGPL-2.1 | CAD import wrapper |
| OpenCascade / OCCT | LGPL-2.1 with the OCCT exception | CAD geometry import |

Exact npm versions are locked in package-lock.json. RUNTIME-NOTICES.txt includes the installed production packages' license text and upstream Assimp/OCCT notices. Electron's LICENSE.electron.txt and LICENSES.chromium.html are retained by the packager. Development-only tools are not application runtime dependencies.

The CAD importer uses LGPL-covered components. Their JS and WebAssembly modules stay unpacked and replaceable. The release ZIP includes exact corresponding wrapper and C++ source snapshots with their upstream build scripts and license files. See BUILD_IMPORTERS.md for revisions, assembly, and replacement instructions. The application source permits modification and debugging of replacements.

7-Zip is detected only when installed separately and is not bundled. User libraries, catalog databases, credentials, benchmark records, and screenshots of personal models are excluded from the application package and public source.

Run npm run licenses before packaging and npm run release:bundle after package verification. Public binary releases must carry the complete source/notices bundle or offer equivalent source access alongside the executable. A standalone portable executable is convenient for local testing; use the complete ZIP for distribution.
