# Verification

## Reproduce the checks

Use Windows x64 and Node.js 24.15 or newer. Tests create disposable files under
.test-data and isolated app profiles. They never use a live user catalog.

1. Run npm ci and npm test for scanning, archives, duplicate hashes, exclusive
   verified transfers, cancellation recovery, metadata, collections, caches,
   cost formulas, and STL edits.
2. Run npm run build followed by npm run test:app for desktop interactions,
   visible preview completion, galleries, filters, cost and mesh dialogs,
   collections, referenced assets, and importer loading.
3. Run npm run format:check and npm audit --omit=dev.
4. Run npm run package and npm run test:packaged to verify the same workflows
   against the unpacked release executable, including actual WASM loading and
   Three.js addon imports.
5. Run npm run release:bundle after packaging completes. It verifies importer
   WASM hashes against pinned upstream revisions and packages sources/notices
   with the executable. Keep the generated SHA-256 file with the ZIP.

## Local acceptance, 0.3.0

The Windows source suite has 20 passing core/feature tests. Desktop fixtures cover
scan/preview, reviewed duplicate moves, mocked cloud consent, static galleries,
failed previews, favorites/tags, saved searches, FDM/resin estimates, profile
import/export, mesh analysis/edit/export, collection lifecycle, referenced assets,
OpenCascade previews, Assimp loading, and the license viewer. UI checks include
normal and minimum supported window sizes.

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
