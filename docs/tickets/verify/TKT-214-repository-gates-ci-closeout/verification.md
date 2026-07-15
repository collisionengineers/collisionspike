# Verification — TKT-214: Enforce repository structure in local checks and CI

## Verdict
TESTED (offline)

## Evidence
- verify-all.mjs wires the repository checks into one local entry point, begins with npm ci, and treats
  a missing check script or retained Python suite as a failure. There is no successful SKIP outcome.
- The GitHub workflow remains split into TypeScript, Python and hygiene jobs for dependency isolation,
  but invokes the same versioned build, test and repository-check scripts from a clean checkout.
- Current offline results: domain 559 tests, Data API 993, orchestration 508 and web 545. Retained Python
  suites passed 884 tests with nine intentional parser skips. Source-size covers 881 owned files under
  the 800-line default plus six exact no-growth ratchets, and database parity covers the locked fingerprint.
- The deterministic runtime snapshot passes for 189 HTTP routes, 56 exported domain DTO declarations,
  seven JSON schemas, 64 PostgreSQL baseline tables, 13 registered resource/database names and 22 stable
  numeric code tables. Its two approved baseline departures are the TKT-215 route removal and PLAN-006
  compatibility-alias removal.
- Inventory, evidence catalog, immutable workingspace, tracked-output, ticket, documentation and
  generated-adapter checks pass.
- Strict, broad, extracted-binary and reviewed-image purge gates pass.
- Forty repository-check tests pass, including the output-free build regression, cross-platform
  inventory coverage, deterministic committed-tree reconstruction, a real shallow-clone failure, and the
  immutable working-folder hash-basis move. Seven runtime-contract cases independently induce method,
  route, function-auth, application-policy, DTO, schema, resource-name, PostgreSQL-column and numeric-code
  drift and prove the gate rejects it.
- TKT-215's audit remains a separate read-only record; the normal gate requires no live access.
- The final `node verify-all.mjs` run began with `npm ci` and completed 34 stages with zero failures,
  including workspace builds/tests, bundle builds/smoke loads, all retained Python suites and every gate above.

## Pending / gaps
- Independent TKT-207/content-class sampling has not yet occurred. This remains a tested verdict rather
  than final plan close-out. Remote CI status is read from the PR checks rather than frozen in this file.
- The clean install reports two moderate advisories through `durable-functions`. The offered forced
  remediation is an incompatible downgrade; PLAN-006 does not apply it or disguise that separate risk.
- The first remote release-candidate run exposed a missing Linux Lightning CSS native package in the
  Windows-authored lockfile. The exact 1.32.0 Linux x64 GNU package is now pinned beside the existing
  Rollup, Rolldown and Sharp portability pins; the replacement CI run must pass before this evidence is final.

## How to re-verify
Run node verify-all.mjs twice from clean checkouts; it performs npm ci, builds, tests, packages and
smoke-loads both bundles before the repository checks. Then inspect the matching remote CI run. An
independent verifier must sample each disposition class,
evidence type, runtime root, documentation authority, ticket status and adapter target.
