# Verification — TKT-012: Define the combined dashboard/queue count contract

## Verdict
TESTED (offline)

## Evidence
- `api/src/functions/dashboard.test.ts` — 10/10 passing (the dashboard count contract).
- `api/src/lib/mappers.test.ts` — exercises the supporting mappers.
Together these assert the lifetime-vs-windowed count split and the stage→queue mapping.

## Pending / gaps
Offline unit tests only; not asserted against live Postgres counts. Live counts move and are not pinned here — see ../../architecture/live-environment.md.

## How to re-verify
- From `api/`: run the test suite (e.g. `npm test`) and confirm `dashboard.test.ts` is 10/10.
