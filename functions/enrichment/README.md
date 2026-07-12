# Canonical vehicle-data enrichment service

`functions/enrichment/` is the sole vehicle-data owner for the CollisionSpike case
workflow. The retained Python Function holds provider authentication and HTTP details,
normalises registrations once, calls DVSA/DVLA, and returns the versioned
[`vehicle-data.v1`](../../contracts/vehicle-data-v1.schema.json) contract.

The existing orchestration/Data API case writer is a temporary thin consumer of the
top-level compatibility fields. It does not own lookup, cleaning, or mileage maths;
TKT-151 will persist and apply the nested contract without reimplementing it.

## Runtime boundary

```text
orchestration / explicit retry
          |
          v
POST /api/dvsa-mot/enrich
          |
          v
vehicle_data.VehicleDataService
  |-- dvsa_client.py  (provider transport/auth only)
  |-- dvla_client.py  (provider transport/auth only)
  `-- vehicle_data/mileage.py (the one handwritten estimator)
          |
          v
vehicle-data.v1 + temporary compatibility projection
```

`analysis.py` contains no rules; it is a deprecated import facade over
`vehicle_data.mileage`. The standalone `dvla-dvsa-connector` and `mileagetool`
repositories are not case-workflow dependencies and must delegate to this service
contract before their local estimator copies can be treated as equivalent.

## Request

```json
{
  "vrm": "TE57 VRM",
  "document_has_mileage": false,
  "target_date": "2026-07-12"
}
```

- `target_date` is optional and defaults to the lookup date.
- `document_has_mileage` defaults to `true`; instruction mileage remains
  authoritative under ADR-0006.
- `dry_run: true` still returns presence-only configuration health without a
  provider call.

## Mileage result semantics

- `observed`: exact trusted MOT-date reading; exact value is retained.
- `estimated`: bounded interpolation or forecast with an eligible empirical
  calibration bucket.
- `range_only`: a useful point/range exists but no eligible chronological
  calibration bucket supports a probability claim.
- `insufficient`: ambiguity, stale horizon, or evidence scarcity makes even a
  range unsafe.

The output always means **displayed odometer**, never unknowable lifetime mileage
after a reset/replacement/rollover. Forecast points are rounded to 100 miles.
Observed readings remain exact.

Cleaning preserves every raw MOT row and its source/test number/date/result,
original odometer value/unit/result type, registration-at-test and stable identity
when present. Decisions are recorded alongside the row: dedup, fail/retest episode,
short interval, isolated spike/dip, segment boundary, unit ambiguity, zero movement,
extreme usage and historical-only gap.

## Versioned priors and calibration

There is no hard-coded probability score. Optional JSON app settings supply
versioned artefacts:

- `MILEAGE_COHORT_PRIOR_JSON`
- `MILEAGE_CALIBRATION_PROFILE_JSON`

Without a defensible prior the estimator does not cohort-assist. Without a matching
calibration bucket it returns `range_only`, not “high confidence”. The chronological
holdout harness in `vehicle_data/backtest.py` reports MAE, median absolute error,
range coverage and useful-tolerance coverage by horizon, vehicle type/age, clean
interval count, volatility and anomaly class.

## Persistence contract

Fresh-build DDL is [`200_vehicle_data.sql`](../../migration/assets/schema/200_vehicle_data.sql);
the idempotent rolling delta is
[`2026-07-12-tkt152-vehicle-data.sql`](../../migration/assets/schema/deltas/2026-07-12-tkt152-vehicle-data.sql).
Lookup runs, provider snapshots, raw MOT observations, results and model profiles are
append-only (`SELECT`/`INSERT`; forced RLS, no app update/delete).

## Offline gates

```powershell
python -m pytest -q
```

All token/provider calls are mocked. No live provider, database or Azure mutation is
part of this test path.
