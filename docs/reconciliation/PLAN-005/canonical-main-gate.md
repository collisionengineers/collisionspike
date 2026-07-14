# PLAN-005 canonical main base gate

Implements PLAN-005 lines 193–205.

## Revision

- Dedicated canonical worktree: `C:\Users\PC\Documents\GitHub\collisionsuite\active\collisionspike-ui-readiness`.
- Local `main` began clean at `d6ffa01309639e06a5d50514d70bfba38fec8246`.
- A fresh fetch confirmed the plan baseline `origin/main` at
  `927fd1872432c39ba8ffe3fc7eca565bd078d7e3`.
- `git merge --ff-only origin/main` completed; local and remote `main` now point to the same exact SHA and
  the worktree remains clean after install/build/test.
- Commit `927fd187` contains 25 changed paths and every one is under `project-demo/`; it changes no runtime
  path and was intentionally retained.

## Deterministic install

`npm ci` from the root lockfile completed successfully: 358 packages installed and 363 audited. npm reported
four dependency advisories (three moderate, one high); no lockfile mutation occurred. Breaking-version
`npm audit fix --force` was not applied as an unreviewed base-gate mutation.

## Aggregate offline gate

`node verify-all.mjs` exited 0 on the exact revision:

| Gate | Result |
|---|---|
| SPA type-check + production build | PASS |
| SPA tests | PASS — 522 tests |
| Data API type-check/build | PASS |
| Data API tests | PASS — 723 tests |
| Domain contract/codec/parity tests | PASS — 1,188 tests |
| Orchestration type-check/build | PASS |
| Orchestration tests | PASS — 441 tests |
| UI red-budget static gate | PASS |

Aggregate result: 8 passed, 0 failed, 13 skipped. The gate itself defines those skips as allowed: retired
Power Platform checks, Python suites without local virtual environments, opt-in email-corpus evaluation,
superseded connector/generated-service checks, and opt-in live registry verification. Live verification and
the ticket-specific Python/live proofs remain owned by their later PLAN-005 stages; this result is the exact
offline base gate, not production certification.
