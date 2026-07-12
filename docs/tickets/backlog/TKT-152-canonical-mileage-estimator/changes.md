# Changes — TKT-152: Consolidate vehicle lookups and harden the MOT mileage estimator

## Status
Implemented and offline-tested on `codex/tkt-152-canonical-mileage` (2026-07-12).
Not deployed and not made the live default in this ticket branch. A production-scale
chronological calibration profile, live persistence/application (TKT-151), deployment,
and independent live verification still gate completion.

## Canonical ownership and contract

- Added `functions/enrichment/vehicle_data/` as the sole CollisionSpike case-workflow
  owner: provider orchestration (`service.py`), contract/model types (`contracts.py`),
  one provider-boundary registration normaliser (`registration.py`), one handwritten
  MOT cleaner/estimator (`mileage.py`), and chronological evaluation (`backtest.py`).
- Added the authoritative `contracts/vehicle-data-v1.schema.json` and a shared, no-logic
  TypeScript consumer view in `packages/domain/src/contracts/vehicle-data.ts`, guarded by
  a schema-parity test.
- `function_app.py` now performs one `VehicleDataService.lookup` and returns the nested,
  versioned contract. Existing top-level case-writer fields are a mechanical adapter;
  `range_only`/`insufficient` results never become legacy point mileage.
- Replaced the copied 551-line `analysis.py` implementation with a deprecated no-maths
  facade. Both DVSA and DVLA transports delegate registration canonicalisation to the
  owner and expose distinct found/not-found/invalid/configuration/temporary outcomes.
- Removed unused `/api/enrich` clients from the API and orchestration libraries. The
  active orchestration activity and Data API case route consume the shared canonical
  response type; current fill-if-empty case application remains explicitly TKT-151 scope.
- Recorded the complete in-repo and sibling product inventory/decisions in
  `docs/architecture/vehicle-data.md`. The standalone MCP/Cloudflare connector and C#
  mileage tool are not runtime dependencies or acceptable fallback sources; they remain
  delegated contract consumers and are non-canonical until changed in their own repos.

## Estimator behaviour

- Preserves every provider MOT row and original source/test/date/result/value/unit/status,
  registration-at-test and stable identity, then records dedup/retest/rejection decisions.
- Normalises recognised MI/KM and current `READ` plus documented/example legacy `OK`;
  consolidates fail/retest episodes; excludes `<90d`, negative, `>100k/year`, and `>900d`
  intervals from rate estimation without deleting evidence.
- Deterministically handles isolated keying spikes/dips, persistent lower-reading
  displayed-odometer segments, zero movement, unit switches/contradictions, unresolved
  resets, and extreme rates. Ambiguous final state abstains.
- Returns exact readings on exact test dates, bounded interpolation between trusted
  same-segment observations, recency/quality-weighted-median forecasts, and guarded
  cohort-assisted backcasts. Cohort influence reduces as clean evidence grows and when
  the newest usable endpoint is stale.
- Uses `observed | estimated | range_only | insufficient` outcomes and labels every
  result `displayed_odometer`. Estimated points round to 100; observations remain exact.
  There is no hard-coded confidence label or probability. Only a valid versioned profile
  with SHA-256 provenance, at least 30 matching holdouts, and finite ordered residual
  quantiles can emit an empirical prediction interval; otherwise the result is range-only.
- Defaults to a 730-day forecast horizon and abstains after it.

## Immutable persistence

- Added fresh-build `migration/assets/schema/200_vehicle_data.sql` and idempotent delta
  `deltas/2026-07-12-tkt152-vehicle-data.sql` for model profiles, lookup runs, provider
  snapshots, raw MOT observations and estimate results.
- All five tables are forced behind RLS and append-only to `cespk_app` (`SELECT, INSERT`;
  no update/delete). Canonical/delta parity is test-covered.

## Deterministic evaluation evidence

- Added eight synthetic vehicle histories / 24 chronological hidden-next-MOT predictions
  spanning car, van and motorcycle cohorts. Fixture digest:
  `127d1e55a09d266925f43f69c871d4080a638f4e2ef02cdf74fca7731ea17937`.
- Fixture result: MAE 379.167 miles, median absolute error 300 miles, uncalibrated-range
  coverage 100%, and ±2,500-mile useful-tolerance coverage 100%. The harness reports the
  same measures by horizon, vehicle type, age band, clean-interval count, volatility and
  anomaly class. This small deterministic fixture proves mechanics/reproducibility, not
  production coverage; the estimator will not make a probability claim from it.
- TKT-044 deterministic old/new comparison: the prior algorithm's 40,000-mile / 403-day
  fixture used 7,995 miles/year and returned 48,800. Exact-date recency weighting now uses
  8,005 miles/year and also returns 48,800, but correctly returns `range_only` without an
  eligible calibration profile. The existing DVSA fixture remains 62,400; its robust recent
  rate is 8,150/year (old 8,100) and the injected test profile reproduces 60,300–64,500.

## Gates run

- `functions/enrichment`: `python -m pytest -q` → **51 passed**.
- Python compile/import gate (`compileall`) → pass.
- Data API: TypeScript build → pass; Vitest → **64 files / 617 tests passed**.
- Domain contract suite → **54 files / 1,104 tests passed** after the new parity test.
- Aggregate `node verify-all.mjs` → **8 passed, 0 failed, 13 expected skips**.
- `node migration/assets/verify-parity-pg.mjs` → all applicable checks passed.
- `node scripts/check-doc-links.mjs` → 0 broken links / 0 orphan docs / 0 live-fact leaks.
- `node scripts/check-tickets.mjs` → 164 tickets / 4 plans / 0 failures / 0 warnings.
- JSON parse validation and `git diff --check` → pass.

## Honest remaining gates

- Do not set a production calibration profile or describe the estimator as calibrated until
  a large chronological DVSA corpus proves baseline comparison and declared coverage across
  the required slices. The fixture above is deliberately insufficient for that claim.
- TKT-044's previously sampled live VRMs were not called from this no-live-mutation branch;
  rerun old/new results after deployment and record them in independent verification.
- TKT-151 must apply/persist the nested lookup/run/evidence contract, surface insufficient
  mileage as Not Ready, and add the case warning/UI wording. This branch intentionally does
  not change case readiness or UI.
- The sibling MCP/Cloudflare and Windows applications still contain their own estimators.
  They are outside this repository/commit and explicitly non-canonical; their follow-up must
  replace those copies with calls to `vehicle-data.v1` before suite-wide parity can be claimed.
