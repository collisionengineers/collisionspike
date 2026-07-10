# Verification — TKT-145: Accepted case_link on a previously-uncased email must backfill its evidence to the case

## Verdict
PENDING

## Evidence
Offline: regression tests green (api 395 / orch 271 / domain 1076; `tsc -b` ×3) — enqueue-after-commit,
double-accept no-re-enqueue, note-on-terminal-failure, status-after-persist ordering, $search
corroboration (see [changes.md](./changes.md)). Deployed 2026-07-10: orch 73 / api 95 functions, the
`evidence-backfill` queue provisioned ([evidence/deploy-2026-07-10.md](./evidence/deploy-2026-07-10.md)).

## Pending / gaps
The LIVE proof is deliberately operator-performed: accept suggestion
`e1301dc9-5936-4507-b5ef-df8adb410aa3` (uncased desk@ email "(EREF9) RTA on 19/06/2026…" →
case QDOS26023) in the SPA, then run the post-accept SQL/App-Insights checks in
[changes.md](./changes.md) §Post-accept verifier checks
(baseline: [evidence/live-proof-staging.md](./evidence/live-proof-staging.md)).

## How to re-verify
See the Acceptance section of the ticket spec + changes.md §Post-accept verifier checks.
