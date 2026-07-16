# Verification — TKT-012: Define the combined dashboard/queue count contract

## Verdict
TESTED (offline)

## Evidence
- `services/data-api/src/features/cases/dashboard-routes.test.ts` — 10/10 passing (the dashboard count contract).
- `services/data-api/src/shared/mapping/` — exercises the supporting mappers.
Together these assert the lifetime-vs-windowed count split and the stage→queue mapping.

## Pending / gaps
Offline unit tests only; not asserted against live Postgres counts. Live counts move and are not pinned here — see ../../operations/live-environment.md.

## How to re-verify
- From `services/data-api/`: run the test suite (e.g. `npm test`) and confirm `dashboard.test.ts` is 10/10.
