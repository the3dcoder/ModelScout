# Feature research and roadmap

Research reviewed: 2026-09-27–28. Scope: local Windows model-library discovery, organization, printing estimates, and model inspection.

## Evidence, not a market-wide ranking

We reviewed primary GitHub issues via the GitHub CLI/API, project documentation, and printing-tool documentation. Counts are a snapshot, not comparable survey results. An open issue can describe an older version; a proposed PR is not a shipped capability. We did not copy implementation code from the surveyed projects.

| Signal | Primary evidence | Interpretation for this app |
| --- | --- | --- |
| Import/sync has strong interest in the sampled library tracker | [Manyfold #1990](https://github.com/manyfold3d/manyfold/issues/1990): 23 reactions, 17 comments, closed; [#4530](https://github.com/manyfold3d/manyfold/issues/4530): 13 reactions, open | High-interest future feature; existing-library discovery is the immediate product priority. |
| Live previews can overload a browser | [Manyfold #4791](https://github.com/manyfold3d/manyfold/issues/4791) requests static images before opening live 3D; [#4455](https://github.com/manyfold3d/manyfold/issues/4455) reports large-preview crashes | Use one isolated thumbnail renderer and image cards; never create a live 3D scene for every card. |
| Richer tagging filters solve real collection tasks | [Manyfold #2398](https://github.com/manyfold3d/manyfold/issues/2398) describes miniature filters involving multiple conditions | Include all/any/excluded tags and removable filter chips. |
| Bulk workflows matter | [Manyfold #2295](https://github.com/manyfold3d/manyfold/issues/2295), [#4552](https://github.com/manyfold3d/manyfold/issues/4552) | Bulk metadata and adjustable pages reduce repetitive navigation. |
| Archives and preservation of original organization remain relevant | [Manyfold #456](https://github.com/manyfold3d/manyfold/issues/456), [STLVault](https://github.com/moddroid94/STLVault) | Retain opt-in archives, original names, and reviewed source/destination plans. |
| Material-only prices omit substantial job costs | [OrcaSlicer #3502](https://github.com/OrcaSlicer/OrcaSlicer/issues/3502): 4 reactions and 23 comments, open; [proposed PR #13906](https://github.com/OrcaSlicer/OrcaSlicer/pull/13906), open | Expose energy, machine depreciation, maintenance, labor and consumables alongside material. Other projects are also addressing this; costing alone is not unique. |
| Cross-platform repair availability is uneven | [OrcaSlicer #5013](https://github.com/OrcaSlicer/OrcaSlicer/issues/5013): 18 reactions; [#1437](https://github.com/OrcaSlicer/OrcaSlicer/issues/1437): 4 | Local diagnostics and reviewed copies are useful; advanced repair needs stronger geometry handling than a one-click promise. |

Additional feature references, not demand rankings: [fo-3dp](https://github.com/Burhan-Q/fo-3dp) demonstrates a visual collection workflow and optional embeddings; [My3DLibrary](https://github.com/kenny-print-it/My3DLibrary) demonstrates local Windows library management. Neither establishes uniqueness for Model Scout.

## Implementation choices and reused resources

Existing MIT Three.js loaders and its [STL exporter](https://threejs.org/docs/pages/STLExporter.html) cover previews and simple geometric transforms; SQLite handles persistent metadata and indexed queries. Prettier makes the existing compressed source reviewable. No additional runtime framework or remote service is needed for this pass.

The [Prusa price calculator](https://blog.prusa3d.com/3d-printing-price-calculator_38905/) accepts slicer time/material or G-code and accounts for preparation. Model Scout follows that evidence-based input boundary: it does not invent print time from a bounding box. [Formlabs' cost framework](https://formlabs.com/eu/blog/how-to-calculate-3d-printer-cost/) identifies ownership, materials/consumables and labor; resin profiles therefore include wash/cure equipment and consumables in addition to printer time. These sources inform categories, not default price claims.

[Prusa's modeling guidance](https://help.prusa3d.com/article/modeling-with-3d-printing-in-mind_164135) explains the need to review manifold geometry and physical dimensions. [Manifold](https://github.com/elalish/manifold) is a promising future Boolean engine, but requires manifold input for its guarantee; it is not a universal broken-mesh repair tool. [Prusa's transform documentation](https://help.prusa3d.com/article/move-rotate-scale-tools_1914) shows scale/rotation as established workflows. We reuse Three.js for those operations and expose the actual limited cleanup scope.

## Delivered in 0.2.0

- Gallery of static images generated for visible items, with a Prepare this page action, cached failures, and explicit retry. One hidden renderer processes one file at a time, with a timeout and no external asset fetching.
- Favorites, normalized personal tags, bulk add/remove/replace, all/any/exclude filters, saved searches, list/gallery toggle, 24/48/150 result pages, and Ctrl+F.
- Geometry and thumbnail reuse for unchanged file fingerprints. Duplicate hashes are reused after metadata checks. Changed fingerprints invalidate derived results. Notes/tags/favorites survive scans. Cancelled/interrupted scans restore the previous inventory.
- Filament and resin cost profiles, import/export of versioned Model Scout JSON, supported G-code comment import, editable whole-job inputs, per-job/per-part cost and target gross margin. Saved estimates retain profile assumptions, input source and file version.
- STL basic topology diagnostics, bounded background processing, before/after counts, uniform scale, XYZ rotation, optional zero-area/duplicate triangle removal, edited 3D preview, exclusive new-file export, hash verification and an edit receipt. No original is overwritten.

## Differentiation hypothesis and next priorities

The strongest opportunity is connecting discovery, evidence, estimates and derived files in one local library. This is a product hypothesis to validate, not a claim that competitors lack every part of it.

1. Direct imports for widely used filament and resin slicers: retain where time/material/profile values came from, report unsupported fields, avoid silently substituting assumptions. Current import handles Model Scout profiles and selected text G-code comment formats, not every vendor's configuration or binary resin format.
2. Actual-versus-estimated job history: record material, elapsed time, labor and failures, then show deviations by printer/material. This could make a library useful after printing instead of only before it. It requires real completed-job data; no fabricated calibration factors are shipped.
3. Expand project transfers beyond OBJ/MTL and glTF to additional assembly formats, with explicit dependency coverage.
4. Geometry similarity, distinctly separated from byte-identical duplicates; evaluate quality on known positive/negative examples before offering cleanup actions.
5. Advanced repair: investigate robust hole filling, winding repair and self-intersection handling with visual change metrics and explicit tolerance. Retain holes that may be intentional and preserve original files. Basic checks do not prove printability.
6. Website import/sync only after selecting services, license metadata, account handling and supported APIs for each integration.

These larger features are not silently represented as implemented. Current bounded tools and limitations are described in README.md and the verification receipt.

## Delivered in 0.3.0

[Manyfold #459](https://github.com/manyfold3d/manyfold/issues/459) requests collections (2 positive reactions when reviewed); [#764](https://github.com/manyfold3d/manyfold/issues/764) requests associated project files (4). These are useful qualitative signals, not proof of broad popularity. Model Scout now supports flat collections with creator/source/license notes, persistent membership, filters, and bulk membership edits. Nested collections remain future work.

Reviewed transfers now resolve declared local OBJ materials/textures and glTF buffers/images, preserve their relative paths, copy support files before models, and keep shared asset originals. The [glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) defines buffer and image URI fields. Three.js MTLLoader supplies the material parser. Unsupported references stop automatic inclusion and require review; this is not a universal project dependency resolver.

Reliability work binds preview reads to the restored file fingerprint after cancelled scans, limits transfer-progress payload size, preserves metadata after verified moves, and guards stale inspector updates. Public-source preparation adds MIT licensing for original code, complete runtime notices, importer source bundles, fixture-based Windows CI, and contributor documentation.
