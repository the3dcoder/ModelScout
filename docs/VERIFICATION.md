# Verification

## Reproduce the checks

Use Windows x64 and Node.js 24.15 or newer. Tests create disposable files under
.test-data and isolated app profiles. They never use a live user catalog.
Set `$env:SCOUT_RETAIN_FIXTURES='1'` before these commands unless fixture removal
has been explicitly authorized. Keep generated outputs and release candidates.

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

## Local acceptance, 0.5.2

Use `SCOUT_RETAIN_FIXTURES=1` to retain generated originals and collections.
This mode passes 31 core/feature tests and all eight source desktop workflows,
plus the same eight workflows against the unpacked Windows release executable.
It skips four core move/relocation checks, substitutes copying for the duplicate
move UI check, and omits collection-removal UI execution. CI uses this mode.
Do not describe it as complete move/delete coverage. The full 31-test source
suite also passed locally in this session, but an attempted anchored negative
name filter failed to exclude its destructive fixture checks. The behavior was
reproduced in a harmless two-test fixture; positive `--test-skip-pattern` exclusions
were verified before enabling retained-fixture checks. That earlier 31-test run
preceded the category chunking regression added in 0.5.2. No personal libraries or
live app profiles were used by tests.

New coverage: model mode unchanged; all-file game discovery, unknown/extensionless
types, opt-in archive members, family/saved filters, scoped unique results,
fresh SHA-256 deduplication, aliases/historical paths, category-index writer
rotation, reviewed copy, source retention, changed/tampered-plan rejection,
1,000-entry category chunks and hash-prefix asset folders,
destination containment, cancellation, raster previews/gallery, persisted scan
mode and minimum supported window size. Copy tests verify actual file bytes,
source fingerprints, catalogs and receipts. Native dialogs/reveal and cloud calls
remain intercepted or mocked where applicable.

Independent review identified three additional regressions: unique-view
preparation omitted aliases, filtered destination checks omitted other scan
roots, and cancelled mode changes mislabeled the restored catalog. All three
failed newly added tests before fixes and now pass. Coverage includes an empty
scan root, stale duplicate aliases, process-reopen mode recovery, and desktop
preparation from unique results.

A read-only large-library scan found 201,335 files across 609 directories, with
zero errors, in 25.09 seconds; average unfiltered gallery-page query was 19.42 ms.
A separate complete SHA-256 pass found 160,096 unique hashes and 41,239 extra
copies, with zero read/fingerprint errors. Timing includes storage/cache effects.
This does not establish the runtime of a full-library prepared export or copy;
development did not copy the owner's library. Receipts and paths remain private
under ignored artifacts.

Format checks, build, dependency audit and manifest-based portable packaging
passed. Packaging retains earlier generated outputs and includes only current
manifest files. The build is unsigned. Maps/atlases/projects are flagged for
reference review; reference rewriting and source conversion are not implemented.

## Historical local acceptance, 0.4.1

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
