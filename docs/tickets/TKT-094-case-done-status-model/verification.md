# Verification — TKT-094: Case `done` terminal state — status model + auto-`eva_submitted`

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
- Parity test passes at 13 statuses / 5 terminals; `verify-parity-pg.mjs` §1/§4 green; `node verify-all.mjs` green.
- Export-for-EVA on a `ready_for_eva` case flips the badge to EVA Submitted, leaves the Review queue, and increments the throughput tiles; second click is a no-op; `eva_submitted` audit row present.
