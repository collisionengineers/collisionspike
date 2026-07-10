# Verification — TKT-145: Accepted case_link on a previously-uncased email must backfill its evidence to the case

## Verdict
PENDING

## Evidence
Offline: regression tests green (api 395 / orch 271 / domain 1076; `tsc -b` ×3) — enqueue-after-commit,
double-accept no-re-enqueue, note-on-terminal-failure, status-after-persist ordering, $search
corroboration (see [changes.md](./changes.md)). Deployed 2026-07-10: orch 73 / api 95 functions, the
`evidence-backfill` queue provisioned ([evidence/deploy-2026-07-10.md](./evidence/deploy-2026-07-10.md)).

## Pending / gaps
The LIVE proof is deliberately operator-performed: accept staged suggestion
`025c8ce2-a4bf-4ed7-a57d-2c1a25231975` (uncased desk@ email "Engineer Riage-Our claim REF:
46573/1- Vehicle registration: SW18EAY" → case A.QDOS26034) in the SPA, then run the post-accept
SQL/App-Insights checks in [changes.md](./changes.md) §Post-accept verifier checks
(baseline: [evidence/live-proof-staging.md](./evidence/live-proof-staging.md)).
(The earlier natural stage `e1301dc9…` was MOOTED by the TKT-140 drain — its accept is now a
harmless FILL-IF-EMPTY no-op; superseded per the re-stage record.)

## How to re-verify
See the Acceptance section of the ticket spec + changes.md §Post-accept verifier checks.
