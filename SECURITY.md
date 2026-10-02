# Security reports

For a vulnerability that could expose files or modify originals without a reviewed
operation, use the repository's private vulnerability reporting channel when
available. Otherwise contact the repository maintainer privately before posting
exploit details. Never include API keys or private models in a public issue.

Include the version, Windows version, affected format or operation, reproduction
steps, and a minimal shareable sample. Explain whether the issue occurs in the
source build, packaged build, or both. Security patches should be verified against
current source and an isolated packaged profile.

The renderer is sandboxed, filesystem access goes through a bounded preload API,
and previews do not fetch external resources. Native and WebAssembly parsers still
process complex untrusted input; keep dependencies and the operating system current.
Format support is not a guarantee that every malformed model is harmless.
