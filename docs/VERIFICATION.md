# Verification

## Reproduce the checks

Use Windows x64 and Node.js 24.15 or newer. Tests create disposable files under
.test-data and isolated app profiles. They never use a live user catalog.

1. Run npm ci and npm test for scanning, archives, duplicate hashes, exclusive
   verified transfers, cancellation recovery, metadata, collections, caches,
   cost formulas, STL edits, geometry matching, and keeper validation.
2. Run npm run build followed by npm run test:app for desktop interactions,
   visible preview completion, galleries, filters, cost and mesh dialogs,
   collections, referenced assets, importer loading, and paired geometry review.
3. Run npm run format:check and npm audit --omit=dev.
4. Run npm run package and npm run test:packaged to verify the same workflows
   against the unpacked release executable, including actual WASM loading and
   Three.js addon imports.
5. Run npm run release:bundle after packaging completes. It verifies importer
   WASM hashes against pinned upstream revisions and packages sources/notices
   with the executable. Keep the generated SHA-256 file with the ZIP.

## Local acceptance, 0.4.1

The Windows source suite has 27 passing core/feature tests. Seven source desktop
workflows and the same seven packaged workflows pass. Desktop fixtures cover
scan/preview, reviewed duplicate moves, mocked cloud consent, static galleries,
failed previews, favorites/tags, saved searches, FDM/resin estimates, profile
import/export, mesh analysis/edit/export, collection lifecycle, referenced assets,
OpenCascade previews, Assimp loading, and the license viewer. UI checks include
normal and minimum supported window sizes. Geometry fixtures compare STL/OBJ/PLY,
placement and winding changes, scale and shape differences, invalid files,
active-worker cancellation, cache reuse, changed-fingerprint invalidation, and
saved-estimate relocation. Desktop regression fixtures verify paired previews,
geometry keeper protection across 21 groups, and exact-duplicate keeper choices
across 51 groups. Source and packaged desktop suites each cover these workflows.

Reliability fixtures verify case-insensitive filename search, including accented
names; separate paged folder/archive matches; explicit path scope; saved scope;
matching bulk selection and CSV output; file filters and pagination; thumbnail
preparation and retries; search focus; zero-candidate duplicate completion; failed
scan recovery after reload; both directions of imported density conversion; saved
and legacy estimate review; preserved manual quantities; and catalog migration
with interrupted-scan recovery. Core tests exercise a generated G-code file above
128 MiB, identical results from both import entry points, stale-source rejection,
and the retained archive-member limit. Folder/reveal shell calls, native file
dialogs, and paid cloud requests are intercepted in tests; source file operations,
parsers, cost calculations, previews, SQLite persistence, and transfers are real.

The portable build is unsigned. Source tests and local packaged tests do not
establish GitHub-hosted CI, code-signing, or every format/model combination. Cloud
requests are mocked in tests; a paid live API request is not part of release checks.
C++ importer toolchains are not rebuilt; source and build instructions accompany
matching upstream binaries. Self-intersections, wall thickness, advanced repair,
shape-similarity duplicates, and vendor resin-file estimates remain unsupported.

## Optional library benchmark

Run node scripts/benchmark.cjs followed by an explicit folder path. Add
--duplicates to include content hashing. It reads source files and writes only an
isolated catalog and receipt under artifacts/benchmarks. Do not publish receipts
without reviewing their paths and metadata. Compare timings on the same machine
and storage, noting operating-system cache effects. Private-library benchmark
records and historical test receipts are kept outside the public source tree.
