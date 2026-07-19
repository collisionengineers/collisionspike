# Verification — TKT-214: Enforce repository structure in local checks and CI

## Verdict
TESTED (offline) — PLAN-006 close-out capstone; all ten plan members are done with concrete evidence.

## Correction (2026-07-19)
The per-suite counts and snapshot totals in the Evidence below were captured at PLAN-006 close-out and
remain recoverable from Git history; they are superseded by the current tree after TKT-210's source
decomposition landed. Re-verified on this branch: domain 594 / Data API 1102 / orchestration 573 / web
556 TypeScript tests; the runtime-contract snapshot locks 191 routes / 56 DTOs / 65 PostgreSQL tables /
22 numeric code tables; source-size covers ~940 owned files with **zero** no-growth ratchets (the six
former exceptions were all decomposed below 800 lines by TKT-210); `check:tree` now additionally gates
the human-readable repository tree. The close-out invariant (one aggregate gate, no silent SKIP, drift
rejected) is unchanged; only the counts grew. The full aggregate (npm ci + all workspace suites + retained
Python) is re-run remotely by this PR's CI.

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
- **Independent disposition / content-class sampling — done.** TKT-207's verification.md now records
  independent per-disposition-class (keep/move/rewrite/delete) and per-final-state sampling (35 samples)
  checked against raw Git object bytes, plus the human-readable tree (A5) reconciling to the ledger; the
  generated-adapter, evidence-catalog, image-review, docs-authority and ticket-status gates cover the
  remaining A9 classes. With every plan member now `done` and evidenced, A10's PENDING condition is
  discharged.
- **Remote CI.** The full aggregate `node verify-all.mjs` (npm ci + all four workspace builds/tests +
  retained Python + schema + every gate above, now including `check:tree`) runs on this close-out PR from
  a clean checkout; that run is the authoritative remote evidence and confirms the Linux Lightning CSS /
  portability pins hold — the earlier missing-native-package failure is resolved (the equivalent Linux
  build already passed green on the TKT-210 PR #117).
- The clean install still reports two moderate advisories through `durable-functions`; the offered forced
  remediation is an incompatible downgrade, so PLAN-006 records it as a separate, un-disguised risk rather
  than applying it.

## How to re-verify
Run node verify-all.mjs twice from clean checkouts; it performs npm ci, builds, tests, packages and
smoke-loads both bundles before the repository checks. Then inspect the matching remote CI run. An
independent verifier must sample each disposition class,
evidence type, runtime root, documentation authority, ticket status and adapter target.
