# Model Scout

Start with [HANDOFF.md](HANDOFF.md), then read only the linked guidance relevant
to the task. Inspect Git status and recent commits before editing. Preserve WIP.

Keep personal libraries and live app profiles untouched during development.
Use generated fixtures and isolated `SCOUT_TEST_DATA` profiles. Cloud calls
require explicit opt-in. Archive contents are opt-in for each scan. Transfers
must be reviewed, exclusive and verified; never overwrite originals or targets.

Never delete files, directories, branches, worktrees or user records without the
owner's explicit approval. Set `SCOUT_RETAIN_FIXTURES=1` for development/CI checks
unless fixture deletion has been authorized. This mode omits destructive fixture
checks; it does not establish source-removal or collection-removal UI coverage.
Keep generated artifacts. Do not reset, clean, stash or broadly stage work.

Maintain the canonical handoff with scope, changed paths, checks, limitations and
next steps. Keep private catalogs, source paths and logs out of Git. Use explicit
file paths for commits. Match documentation claims to fresh evidence.
