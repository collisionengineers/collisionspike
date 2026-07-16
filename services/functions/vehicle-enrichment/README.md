# Vehicle enrichment

## Ownership

This service owns registration normalization, vehicle-provider authentication, MOT-history cleaning,
mileage estimation, and the versioned [`vehicle-data.v1`](../../../contracts/vehicle-data-v1.schema.json)
response. Other services consume that contract and do not duplicate its rules.

## Public contract

`POST /api/dvsa-mot/enrich` accepts a registration plus optional target date, instruction-mileage flag,
and idempotency key. Provider calls are made server-side. The response distinguishes observed,
estimated, range-only, and insufficient mileage results and retains the supporting observations.

Instruction mileage remains authoritative. Estimated values are display-only unless the matching
calibration profile and the explicit autofill gate both qualify them. Observed odometer readings remain
exact; forecast points are rounded to 100 miles.

## Callers and persistence

Orchestration requests enrichment during intake and explicit retry. Lookup runs, provider snapshots,
raw MOT observations, results, and model profiles are append-only. Database definitions live in
[`database/baseline/200_vehicle_data.sql`](../../../database/baseline/200_vehicle_data.sql) and
[`database/migrations/2026-07-12-tkt152-vehicle-data.sql`](../../../database/migrations/2026-07-12-tkt152-vehicle-data.sql).

## Configuration

Provider credentials remain server-side. Optional JSON settings provide versioned cohort priors and
calibration profiles. `MILEAGE_ESTIMATE_AUTOFILL_ENABLED` fails closed unless explicitly enabled.

## Tests and deployment

Run `python -m pytest -q` from this directory. All provider calls are mocked. Deployment uses the normal
Python Function packaging path documented in [`docs/operations/deployment.md`](../../../docs/operations/deployment.md);
this directory is the deployment source for `cespkenrich-fn-gi62sd`.
