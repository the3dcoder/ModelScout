# Contributing

Use Windows x64 and Node.js 24.15 or newer. Install locked dependencies with
`npm ci`. `npm start` builds and opens the desktop app. Set `SCOUT_TEST_DATA`
to an empty absolute directory for manual development with an isolated profile.

Before a pull request, run:

```powershell
npm test
npm run build
npm run test:app
npm run format:check
```

Use `npx prettier --write` on changed source files. Explain the user-visible
problem, resulting behavior, and relevant validation in the pull request.
For UI changes, inspect the rendered app at normal and minimum window sizes.
For importer or packaging changes, also run `npm run package` and
`npm run test:packaged`.

Tests generate their own files under `.test-data` and use isolated catalogs.
Do not point write-operation tests at a personal library. Keep metadata migrations
compatible with existing catalogs, and test cancellation and changed-file cases
when touching scanning, caching, or transfers. Originals must remain untouched by
analysis; mesh exports use new files; destination collisions must never overwrite.

Use established parsers where practical. New runtime dependencies need a clear
license, pinned lockfile entry, and updated notices. Changing AssimpJS or OCCT
versions also requires matching wrapper/submodule source revisions and verifying
the source bundle. Do not add uploaded models, credentials, real user paths, or
private benchmark data to a pull request.

The Windows CI workflow runs fixture tests. The manual build workflow creates a
complete release artifact after source and packaged-app checks; it does not create
a public GitHub release automatically. The output is unsigned unless signing is
configured separately.

Small bug reports should include the app version, Windows version, reproduction
steps, expected behavior, and sanitized error text. For format issues, attach only
a minimal file you have permission to share. See SECURITY.md for sensitive reports.
