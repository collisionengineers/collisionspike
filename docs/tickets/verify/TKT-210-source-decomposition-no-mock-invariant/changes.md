# Changes — TKT-210: Decompose source by feature and enforce the production-data boundary

## Status
verify — feature decomposition and the repository-wide production dependency boundary are implemented
and tested offline; independent verification remains pending.

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

## Summary
Web, Data API and orchestration responsibilities are split into navigable feature/platform boundaries.
Owned source is capped at 800 nonblank lines. A production-entrypoint graph follows direct,
transitive, aliased, package-exported and statically constructed dynamic dependencies across those
three TypeScript surfaces and all six retained Python functions. Six controlled negative tests cover
the failure modes while allowing artificial data that is unreachable from production. The web app
still starts from the honest empty REST-backed data source.
