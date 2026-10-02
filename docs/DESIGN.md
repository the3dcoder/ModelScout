# Architecture and product principles

Model Scout keeps discovery, evidence, and file operations separate. A filename can suggest a category; it cannot confirm identity. Geometry checks describe measurable properties without claiming that a model will print successfully.

## Application boundaries

The sandboxed React renderer uses a narrow preload API. Electron's main process validates requests and owns filesystem access. SQLite stores the current inventory, personal metadata, collections, profiles, saved searches, and fingerprint-bound derived results. Source files are not modified by scanning or analysis.

The scanner streams progress and commits in batches. An inventory snapshot survives cancellation or interruption. Cache reads join on size, modification time, and change time so restored inventory cannot display previews from another file version. The cache is an optimization, not protection against deliberate timestamp manipulation.

Three.js supplies loaders, the MTL parser, previews, and STL export. One hidden renderer generates thumbnails for visible items. Assimp and OpenCascade conversion and STL diagnostics run in bounded workers. Previews block external resource fetching.

Collections link persistent file IDs to project metadata. They survive changes to scan scope and report unavailable members. Verified in-app moves remap personal metadata, collection memberships, and saved estimates to the destination ID; that location becomes available when scanned. Estimates retain their source fingerprint for review. Files moved outside the app are not automatically reconciled.

Geometry comparison reuses Three.js STL/OBJ/PLY loaders in a bounded worker. It subtracts the mesh minimum corner, quantizes coordinates at 0.00001 model units, sorts vertices within each face and faces within the mesh, and hashes that canonical triangle list. Scale and orientation are retained; appearance and units are excluded. This detects matching triangle exports, not arbitrary shape similarity. A separate fingerprint- and algorithm-bound cache prevents stale results from appearing after rescans. Main-process validation checks that selected candidates leave a keeper in every group, including off-page groups, before transfer review.

## File transfers

A concrete plan records sources, destinations, fingerprints, actions, referenced dependencies, and blocking errors. OBJ/MTL and glTF 2.0 references are resolved within the search root using a supported asset allowlist. Asset copies finish before selected model transfers. Shared assets retain their originals. Missing references, destination collisions, stale files, and link ancestors block the affected operations.

Exclusive writes, SHA-256 verification, source rechecks, and a durable journal precede removal of a moved source. A failed job may leave verified or partial destination files; these are reported and never silently removed. Transfers are not atomic across multiple files. File handles and timestamp/hash checks reduce races but cannot offer a transactional filesystem against concurrent hostile changes.

## Interface

A search-scope sidebar, paged results area, and inspector keep large libraries usable. Lists use dense rows; galleries use static images. The footer contains selection actions. Dialogs show reviewable changes before file writes. Colors use porcelain, ink, blue, and sea glass with the Windows system font stack.

Cost estimates retain input provenance and expose omitted assumptions. Mesh edits show before/after measurements and export a new file. Optional cloud identification requires review of the rendered image and explicit submission.
