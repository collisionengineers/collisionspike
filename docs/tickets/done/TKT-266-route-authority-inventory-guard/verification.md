# Verification — TKT-266: Add the route and authority inventory guard

## Verdict

PASS — 2026-07-20.

## Evidence

- **A1 — the guard builds the inventory and fails on each class.** `check-route-authority.mjs` under
  `scripts/checks/` fails on: a second internal-trust auth helper; a duplicate `(capability, transition)`
  authority; an unowned internal route; and a broken or cyclic delegation. All four are exercised by the
  unit test.
- **A2 — import/AST-aware, not lexical; no false positives.** It parses with the TypeScript compiler.
  On the real auth files it flags ONLY the canonical `withServiceAuth`; `withRole`,
  `withVehicleLookupAuth`, and `withApiKey` are not flagged. The three distinct outbox authorities and
  the staff-BFF → focused-Function delegations pass.
- **A3 — fixtures prove the failures and the pass.** `second-trust-helper.fixture.ts` proves (a) a
  re-introduced `withServiceAuth` is flagged and a principal-gated wrapper is not; unit tests prove (b) a
  second authoritative writer in a lane trips `duplicate-authority`; and (c) an explicit delegation passes
  while broken/cyclic delegations fail.
- **A4 — runs in verify-all + CI, passes on the current tree.** Registered in `verify-all.mjs`; the guard
  exits 0 on the post-TKT-245/262-265 tree (224 service TS files scanned; one trust seam, no duplicate
  authority, sound delegation). The test is auto-discovered by the `scripts/checks/*.test.mjs` glob.
- **A5 — no live write.**

## Commands

- `node scripts/checks/check-route-authority.mjs` → PASS (0 findings, exit 0).
- `node --test scripts/checks/check-route-authority.test.mjs` → 8/8 pass.
- `node --test scripts/checks/*.test.mjs scripts/maintenance/*.test.mjs` → 91/91 pass (new test discovered).
- `check:scripts-dedup`, `check:source-size`, `check:layout`, `check:forbidden`, `check:outputs`,
  `check:docs`, `check:line-endings` → all PASS.

## Pending / gaps

None for this ticket. The guard is scoped to the internal-service authority lane + the trust-seam
invariant + delegation soundness (the topology PLAN-008 consolidates); the raw all-routes census remains
owned by `check:runtime-contract`, which this guard deliberately does not duplicate. PLAN-008 is now 6/6
members done; the formal plan `active → done` close (with the aggregate net-LOC waiver, matching the
PLAN-007/010 precedent) is an operator decision.

## How to re-verify

`node scripts/checks/check-route-authority.mjs` and `node --test scripts/checks/check-route-authority.test.mjs`
from a clean checkout; add a second `withServiceAuth`-shaped wrapper anywhere under `services/*/src` and
confirm the guard fails.
