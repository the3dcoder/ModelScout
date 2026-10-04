# Model Scout current handoff

## 2026-10-03 — Game asset library

Goal: extend the existing discovery, filtering, duplicate and copy workflows to
support a complete game-asset directory. The owner will choose the destination
and run the feature in the updated application. Development must not copy,
move or delete personal assets or use the live app profile.

Approved design: game mode indexes all file extensions and extensionless files;
archive contents remain opt-in. Prepare a new unique-file library with fresh
SHA-256 hashes, category/family folders, readable names, source aliases,
historical original-path mappings when available, category JSONL indexes and a
Markdown entry point. Copying requires a separate reviewed action. Preserve
originals and never overwrite targets. Flag relative-reference files; do not
claim that maps/atlases/projects are repaired or ready for runtime use.

Branch: `codex/game-asset-library`, based on merged PR #2 / main `92789a0`.
Implementation is complete in `app/game-formats.cjs`, `app/game-library.cjs`, the
scanner, catalog, IPC/preload, asset-library dialog, raster previews and tests.
New asset folders use category/family/hash-prefix paths and readable hashed names;
category JSONL indexes have at most 1,000 entries per chunk. Hash updates are
batched and index writers are bounded. Packaging retains earlier frontend/output
files and selects only current manifest outputs.

Initial evidence: game discovery and verified unique-copy tests pass. A separate
read-only inventory counted 201,335 files, 609 directories and 60 extensions;
fresh content hashing found 160,096 unique hashes and 41,239 extra copies, with
no read errors, source fingerprint changes or historical hash mismatches.
These private library facts are validation evidence, not distributable content.

Verification: 31 core/feature tests pass with `SCOUT_RETAIN_FIXTURES=1`; all eight
source and all eight 0.5.2 packaged desktop workflows pass. Format/build,
dependency audit, unsigned Windows packaging and full source/notices ZIP pass.
ZIP SHA-256: `e32f88e4951f7cd4fb4d71729662074fff1fc56d640040aaa3c6f41e8d6afde0`.
Artifact: `release/0.5.2/Model-Scout-0.5.2-Windows-x64.zip`. ASAR verification
matched six core source files and all six manifest frontend outputs; the ZIP
contains 20 entries including four pinned importer/source archives and notices.
The real game-mode scan took 25.09 seconds with zero errors and an average
unfiltered gallery query of 19.42 ms. Private receipt:
`artifacts/benchmarks/1791080840283/receipt.json` (never publish its source paths).

A negative anchored test-name exclusion unexpectedly ran the earlier full
31-test suite, including generated fixture removals, and all passed. This was
reported to the owner; only isolated fixtures were affected. A harmless probe
verified positive skip-pattern behavior. Retained-fixture checks now omit four
core move/relocation tests and desktop source/collection removal. The owner has
not answered the deletion exception question; do not run those remaining
destructive desktop workflows without approval. CI uses retained-fixture mode.

Delivery: [PR #3](https://github.com/the3dcoder/ModelScout/pull/3) is open and
attached to the app task. Check its live Windows checks for hosted verification;
the local checks below cover the actual source and packaged build. After review,
the owner can extract the complete ZIP, select Game asset library, scan, choose
Create asset library, prepare, then confirm the reviewed copy. Do not run that
copy on their behalf. Keep local candidates/artifacts. The unique library is a
snapshot at preparation time; it does not continuously synchronize source files.

Review checkpoint: three P2 findings reproduced with failing tests, then fixed:
unique-view preparation now expands only the display collapse to retain aliases;
destinations are checked against all scanned roots including empty/unmatched ones;
cancelled and interrupted scans restore previous mode/root metadata with attempted
scope retained separately. The 31 retained core tests pass after these fixes.
Read-only follow-up review found no remaining Important/Critical findings.
Final 0.5.2 checks passed: `SCOUT_RETAIN_FIXTURES=1 npm test` (31), build,
`npm run test:app` (eight), `npm run format:check`, `npm audit --omit=dev` (zero),
`npm run package`, retained `npm run test:packaged` (eight), and
`npm run release:bundle`. The unsigned ZIP hash and packaged source/manifest
bytes were independently checked. Preserve earlier local 0.5.0/0.5.1 candidates.

Hosted checkpoint: paired runs on both initial heads disagree on the cancelled
mode UI check: one passes while one times out waiting for the family selector.
Core/build checks pass. Ten additional local game workflows and a renderer run
at 6x CPU throttling pass. Progress/metadata failure diagnostics were added;
investigate this race before treating hosted desktop validation as complete.

See [README](README.md), [verification](docs/VERIFICATION.md) and
[roadmap](docs/ROADMAP.md) for current product behavior and evidence boundaries.
