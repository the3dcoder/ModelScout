# Model Scout backlog

Assessment date: 2026-10-02. Reviewed against merged 0.4.0, commit
`64c096417f55d8da32a9d14d2664793e3fbfe999`.

GitHub had no open issues or pull requests at assessment time. That does not mean
the product backlog is empty. The items below distinguish reproduced defects
from proposed features. The reliability fixes below are implemented in 0.4.1.

## 0.4.1 resolution

Filename search is now the default. Direct folder and archive name matches appear
separately, without inherited contents, and have their own pagination. Broader
path and metadata searches are explicit choices. Saved searches, bulk selection,
and CSV exports retain that scope. Accented letter case is also matched, addressing
[SQLite's ASCII-only default LIKE behavior](https://www.sqlite.org/lang_expr.html#like).

All four reproduced defects below have regression coverage and implemented fixes:
authoritative worker progress, bounded G-code imports at both entry points,
saved material conversion provenance with review after assumption changes, and
preserved search locations after failed scans. Older imported estimates with no
conversion history require a reviewed quantity before saving again. Manually
entered material quantities remain unchanged after density edits.

## Original reliability findings

### 1. Duplicate-check completion can leave the interface stuck

**Confirmed, high priority.** With two files of different sizes, the duplicate
worker reports a complete check with zero candidates. Depending on IPC timing,
the renderer then replaces that completion with a running state. The UI shows
`0 / 0 files checked`, disables actions, and Cancel cannot clear it because the
backend job has already finished.

Root cause: the Check duplicates action in `src/main.jsx` sets running progress
after awaiting `api.duplicates()`, overwriting an earlier completion event.
`app/files.cjs` can complete a zero-candidate check before that invocation returns.

Proposed correction: make backend progress authoritative and keep invocation
busy state separate. Check the same ordering pattern in scan startup. Verify
zero candidates, ordinary hashing, fast completion, failure, and cancellation
through the desktop interface without adding timing delays as a workaround.

### 2. Selected G-code imports fail above the preview size limit

**Confirmed.** The same generated 128 MiB-plus-one-byte G-code file imports
2 hours and 25 grams through the file picker, but selecting it from the library
returns the 128 MiB preview-limit error.

Root cause: `app/costs.cjs` uses `readRow()` for a selected file but a bounded
header/footer read for the picker. Cost metadata extraction should have the same
read policy in both paths while retaining fingerprint checks. Archive members
need a separately bounded policy; they must not bypass extraction limits.

Acceptance: both ordinary-file entry points return the same supported estimates
for small and large files; changed sources and unsupported content remain
explicit errors. Reading a large ordinary file must not load its full contents.

### 3. Imported material conversions become stale after density changes

**Confirmed.** Importing 100 grams into a resin profile measured in milliliters
at 1 g/ml gives 100 ml. Changing density to 2 g/ml leaves 100 ml in the job input,
with the original import source still displayed. The corresponding converted
quantity would be 50 ml.

Root cause: `src/CostPanel.jsx` converts the quantity once during import and
retains only the converted input. Changing density does not invalidate it or
preserve enough provenance to explain the conversion.

Proposed correction: distinguish direct quantities, imported conversions, and
manual edits. Retain source units and the density used; invalidate an imported
conversion when that assumption changes and prompt for review. Do not silently
alter a manually entered quantity. Verify both grams-to-ml and ml-to-grams,
profile changes, saved estimates, and manual edits.

### 4. Failed scans discard saved search locations

**Confirmed.** After a successful scan, scanning an unavailable folder preserves
the previous inventory, but replaces `lastScan` with an error-only object.
Reloading the interface then shows zero search locations.

Root cause: the scan error handler in `app/main.cjs` discards root configuration;
renderer initialization reads its locations from `lastScan.roots`.

Proposed correction: preserve the last usable scope when a scan fails and show
the failed attempt separately. Verify missing folders, disconnected roots,
restart/reload, cancellation, and retained inventory/metadata.

## Feature priorities after the reliability patch

| Priority | Feature | Value and acceptance boundary |
| --- | --- | --- |
| Next | Catalog backup and reviewed restore | Preserve tags, notes, collections, profiles, estimates, and saved searches. Verify backup integrity, schema compatibility, and recovery in an isolated profile. Model-file backup is a separate operation. |
| Next | Folder exclusions and reusable scan scopes | Exclude output/review folders and avoid repeatedly typing large-library locations. Show the complete scope before scanning; archive scanning remains explicit opt-in. |
| Next | Navigate all members of large geometry groups | Groups currently expose only the first 80 files. Add member pagination/search while preserving explicit candidate selection and cross-page keeper checks. |
| Later | Estimated-versus-actual print history | Record real time, material, labor, outcomes, and failures for filament and resin jobs. Keep estimate snapshots and units; do not invent calibration data. |
| Needs slicer choice | Direct slicer profile/job imports | Select the owner's actual filament and resin tools first. Import supported fields with provenance, report omitted costs, and avoid treating a slicer configuration as a complete costing profile. |
| Later | Reconcile files moved outside the app | Review exact-content matches before reattaching metadata to new paths. Show ambiguity when several copies match; never remap or delete files automatically. |
| Investigate | Rotated/retriangulated geometry similarity | Evaluate known positive and negative examples, false matches, missed matches, and runtime cost before using it for cleanup candidates. Current triangle matching remains separately labeled. |
| Investigate | Advanced repair and more assembly dependencies | Define supported formats and repair operations, preserve originals, and show geometric changes. Self-intersections, wall thickness, and universal repair are not implemented. |
| Distribution | Publish a verified Windows release bundle | GitHub currently has source and build workflows but no published release. Release the complete executable/notices/importer-sources ZIP with its checksum and accurate unsigned status. |

Automatic deletion, automatic cloud uploads, and symlink consolidation are not
part of the proposed cleanup workflow. Website synchronization remains a later
integration decision requiring selected services and supported APIs.

## Research and verification

The original assessment passed all 22 existing tests, formatting, and the
production dependency audit. Separate disposable-fixture probes reproduced the
four defects above despite that passing baseline. The 0.4.1 suite now passes 27
core/feature tests and all seven source and packaged desktop workflows, including
the new reliability regressions. The production dependency audit reports zero
vulnerabilities. No personal model files or live user catalogs were modified.

The backup recommendation is supported by a concrete
[Manyfold backup discussion](https://github.com/manyfold3d/manyfold/discussions/3620).
[SQLite's backup documentation](https://www.sqlite.org/backup.html) describes live
database snapshots and `VACUUM INTO`, which the app already uses for migration
backups. A reviewed restore flow still needs its own design and verification.

[PrusaSlicer's vendor-bundle documentation](https://github.com/prusa3d/PrusaSlicer/wiki/Vendor-bundles-and-updating-process)
describes real configuration bundles; imported settings need deliberate mapping
to cost assumptions. The
[OrcaSlicer costing request](https://github.com/OrcaSlicer/OrcaSlicer/issues/3502)
supports broader job-cost categories, not a claim that estimates or print history
are unique to Model Scout. These are qualitative signals, not a popularity survey.
See [feature research](FEATURE_RESEARCH.md) for earlier evidence and shipped scope.
