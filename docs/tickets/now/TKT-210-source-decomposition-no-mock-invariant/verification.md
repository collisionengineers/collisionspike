# Verification — TKT-210: Decompose source by feature and enforce the production-data boundary

## Verdict
PARTIAL — reopened on 2026-07-15

## Evidence
- Source-size verification enforces an 800-nonblank-line default and exact no-growth ceilings for six
  disclosed exceptions. The current exceptions are the guided-capture implementation and tests, merge
  implementation and tests, the orchestration Data API adapter, and the Archive operations mixin.
  Therefore A2 is not complete and the former statement that no owned file exceeded 800 lines is retired.
- Retained runtime roots have concise READMEs covering ownership, contract, callers, tests,
  configuration and deployment entry point.
- `node scripts/checks/check-production-dependencies.mjs` traces the production-reachable graph from
  the web app, Data API, orchestration service and all six retained Python function entry points. The
  2026-07-15 run passed across nine graphs, 477 modules and 2,152 dependency edges.
- Six controlled negative tests prove direct and transitive fixture rejection, statically constructed
  dynamic imports, TypeScript aliases and workspace package exports, Python dynamic imports,
  unresolved dynamic-load rejection, and permission for artificial data that is unreachable from
  production. The existing empty-source web test still proves the default contains no fabricated rows
  before authenticated REST configuration.
- Offline suites passed on 2026-07-15: domain 559 tests, Data API 993, orchestration 508 and web 545.
- The aggregate Python run exposed omitted Archive mixin methods during the repository reorg. Those
  existing implementations were restored and the focused 39-test scope/deletion suite passed; the full
  aggregate rerun remains pending.
- Route registration and REST behavior remain covered by the Data API suite. Code-table parity proves
  22 numeric code tables with the current append-only mapping fingerprint locked by the database check.
- The runtime contract snapshot independently locks 189 route method/path/function-auth records,
  56 exported domain DTO declarations, seven JSON schemas and 64 Postgres tables. The PLAN-006 approval record identifies
  the intentional compatibility-alias removal; any further DTO or route drift fails the check.
- No deployment or live-system write was performed.
- The final fail-closed aggregate has not yet completed cleanly after this reopening; its final rerun is
  required before the PR review can close.

## Pending / gaps
- Decompose every ratcheted source file below 800 nonblank lines without behavior drift, then delete the
  matching ratchet entry.
- Remote CI and the final independent clean-checkout sample remain pending.

## How to re-verify
Run `node scripts/checks/check-production-dependencies.mjs`, its controlled Node tests, the web
empty-source test, source-size check, npm run check:runtime-contract, all four package suites, parser
tests and database code-table parity from a clean checkout. Independently review feature ownership
before moving the ticket beyond verify.
