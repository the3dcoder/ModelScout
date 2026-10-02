# Privacy

Model Scout stores the catalog, thumbnail cache, personal metadata, collections,
cost profiles, estimates, and operation logs on your PC in
`%APPDATA%\Model Scout`. Logs and exported CSV files can contain full local paths.
There is no telemetry or automatic model upload.

Scanning, archive inspection, hashing, previews, costing, and mesh operations run
locally. A scan reads the folders you choose, skips linked directories inside the
search tree, and may be incomplete if access is denied. 7z/RAR support invokes your
locally installed 7-Zip executable. Embedded model scripts are not executed.

Cloud identification is optional. After you review and submit the displayed
preview, the app sends that PNG and the file extension to OpenAI's Responses API,
using your API key. It does not send the original file, filename, local path, tags,
or notes. A rendered image may itself contain recognizable or sensitive geometry.
The request sets `store: false`; provider retention and processing policies still
apply. The key remains in process memory for the session and is cleared when the
app exits. Returned suggestions are stored locally with the model's analysis.

Review a transfer plan before copying or moving. Copies leave originals intact;
moves remove a source only after verification. There is no permanent-delete
feature for library cleanup, and no automatic undo. The log records each outcome.

To back up metadata, close the app and copy its data folder. Removing that folder
while the app is closed resets the catalog and local settings without removing
source models. Include its backup and journal files when preserving operation
history. Source code and test artifacts do not include your live data folder.
