# Changes — TKT-210: Decompose source by feature and enforce the production-data boundary

## Status
now — the production dependency boundary remains implemented and passing, but the 2026-07-15 final
PR #100 review found six post-decomposition modules above the 800-nonblank-line ceiling. The earlier
`verify` claim was therefore no longer true and the ticket has been reopened.

## Commits
- b224c54b — establish the monorepo runtime roots before feature-level content changes.

## Files touched
- apps/web/src/app, data, features and shared
- services/data-api/src/features, platform and shared
- services/orchestration/src/workflows, adapters and platform
- services/functions
- package and service READMEs
- package.json, verify-all.mjs and .github/workflows/ci.yml
- scripts/checks/check-production-dependencies.mjs
- scripts/checks/check-production-dependencies.test.mjs
- scripts/checks/production_dependency_graph.py
- scripts/checks/check-source-size.mjs
- scripts/checks/source-size-budget.json

## Summary
Web, Data API and orchestration responsibilities are split into navigable feature/platform boundaries.
New owned source remains capped at 800 nonblank lines. Six exact oversized files are now recorded in a
no-growth ratchet: none may grow, no seventh exception may appear, and a ratchet must be removed as soon
as its file reaches the default limit. Completing A2 requires decomposing those six files and deleting
the ratchets; the gate does not describe that work as complete. A production-entrypoint graph follows direct,
transitive, aliased, package-exported and statically constructed dynamic dependencies across those
three TypeScript surfaces and all six retained Python functions. Six controlled negative tests cover
the failure modes while allowing artificial data that is unreachable from production. The web app
still starts from the honest empty REST-backed data source.
