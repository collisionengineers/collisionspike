# Verification — TKT-214: Enforce repository structure in local checks and CI

## Verdict
TESTED (offline)

## Evidence
- verify-all.mjs wires the repository checks into one local entry point, begins with npm ci, and treats
  a missing check script or retained Python suite as a failure. There is no successful SKIP outcome.
- The GitHub workflow remains split into TypeScript, Python and hygiene jobs for dependency isolation,
  but invokes the same versioned build, test and repository-check scripts from a clean checkout.
- Current offline results: domain 554 tests, Data API 772, orchestration 470 and web 525. Retained Python
  suites passed 860 tests with nine intentional parser skips. Source-size covers 800 owned files within
  the 800-line cap, and database parity covers 22 tables / 171 options at the locked fingerprint.
- The deterministic runtime snapshot passes for 158 HTTP routes, 49 exported domain DTO declarations,
  seven JSON schemas, 52 PostgreSQL baseline tables, 13 registered resource/database names and 22 stable
  numeric code tables. Its two approved baseline departures are the TKT-215 route removal and PLAN-006
  compatibility-alias removal.
- Inventory, evidence catalog, immutable workingspace, tracked-output, ticket, documentation and
  generated-adapter checks pass.
- Strict, broad, extracted-binary and reviewed-image purge gates pass.
- Twenty-nine repository-check tests pass, including the output-free build regression and two
  cross-platform inventory regressions. Seven runtime-contract cases independently induce method,
  route, function-auth, application-policy, DTO, schema, resource-name, PostgreSQL-column and numeric-code
  drift and prove the gate rejects it.
- TKT-215's audit remains a separate read-only record; the normal gate requires no live access.
- The final `node verify-all.mjs` run began with `npm ci` and completed 34 stages with zero failures,
  including workspace builds/tests, bundle builds/smoke loads, all retained Python suites and every gate above.

## Pending / gaps
- Independent TKT-207/content-class sampling has not yet occurred. This remains a tested verdict rather
  than final plan close-out. Remote CI status is read from the PR checks rather than frozen in this file.

## How to re-verify
Run node verify-all.mjs twice from clean checkouts; it performs npm ci, builds, tests, packages and
smoke-loads both bundles before the repository checks. Then inspect the matching remote CI run. An
independent verifier must sample each disposition class,
evidence type, runtime root, documentation authority, ticket status and adapter target.
