# Changelog

## 0.4.1

- Search filenames by default, with explicit path and all-details scopes retained in saved searches, selection, and CSV exports.
- List directly matching folders and ZIP/7z/RAR names separately, with pagination and open/reveal controls. Archive contents remain opt-in.
- Match accented letter case in filenames and location names, while treating wildcard characters literally.
- Prevent fast duplicate checks and scans from overwriting completed backend progress with a running state.
- Use the same bounded, fingerprint-checked G-code import for selected files and the file picker, including large ordinary files.
- Retain imported material units and density; clear stale conversions for review and preserve manual quantities. Review legacy imports that lack conversion history.
- Preserve search locations and the previous inventory after a failed scan, and record the failed attempt separately.
- Include the complete scan/transfer/consent workflow in packaged desktop checks.
- Keep model results visible alongside location matches at the minimum window size.

Rescan after upgrading to index folder and archive names. Source models remain unchanged unless a reviewed transfer or new-copy export is confirmed.

## 0.4.0

- Compare matching STL, OBJ, and PLY triangle geometry across names and formats, separately from exact file duplicates.
- Review candidates with paired previews, paged groups, and explicit selection that leaves a keeper in every group.
- Cancel and resume local comparisons using cached results; retry failed files on demand.
- Preserve exact-duplicate keeper choices across pages and wait for hashing to finish before review.
- Keep saved cost estimates after in-app moves and clear moved models from the inspector.
- Normalize Git checkout line endings so Windows CI can run formatting checks consistently.

Geometry comparison preserves scale and orientation and ignores units and appearance. Rotated models, different triangulation, and precision differences may miss matches. No cleanup runs automatically.

## 0.3.0

- Add collections with creator, source, license, and project notes.
- Include declared local OBJ/glTF assets in reviewed transfers.
- Strengthen cache, cancellation, metadata relocation, and inspector behavior.
- Prepare MIT source, runtime notices, importer source bundles, contributor documentation, and Windows checks.

## 0.2.0

- Add static gallery thumbnails, favorites, tags, saved searches, and bulk metadata.
- Add filament/resin cost profiles and saved job estimates.
- Add basic STL diagnostics and verified export of edited copies.

## 0.1.0

- Discover model and printing files, including opt-in archive scanning.
- Preview supported files, review SHA-256 duplicates, and copy or move files with verification and a transfer journal.
