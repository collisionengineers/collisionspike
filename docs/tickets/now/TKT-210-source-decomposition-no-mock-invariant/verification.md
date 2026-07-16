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
  existing implementations were restored; the full Archive suite passed 274 tests and the final aggregate
  passed 34/34 gates.
- Route registration and REST behavior remain covered by the Data API suite. Code-table parity proves
  22 numeric code tables with the current append-only mapping fingerprint locked by the database check.
- The runtime contract snapshot independently locks 189 route method/path/function-auth records,
  56 exported domain DTO declarations, seven JSON schemas and 64 Postgres tables. The PLAN-006 approval record identifies
  the intentional compatibility-alias removal; any further DTO or route drift fails the check.
- The decomposition itself did not require a live write. The later authorized PR #100 release deployed the
  reconciled application without changing this ticket's incomplete A2 verdict.
- Push and pull-request CI passed the production dependency, source-size, runtime-contract and repository
  hygiene gates on the reviewed application commit.

## Pending / gaps
- Decompose every ratcheted source file below 800 nonblank lines without behavior drift, then delete the
  matching ratchet entry.
- An independent feature-ownership review remains required as each ratcheted file is decomposed.

## How to re-verify
Run `node scripts/checks/check-production-dependencies.mjs`, its controlled Node tests, the web
empty-source test, source-size check, npm run check:runtime-contract, all four package suites, parser
tests and database code-table parity from a clean checkout. Independently review feature ownership
before moving the ticket beyond verify.
