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
  `docs/architecture/vehicle-data.md`. Follow-up branch
  `dvla-dvsa-connector:codex/tkt-152-canonical-mileage-adapter` removes the active MCP
  server's copied maths and calls `vehicle-data.v1` without a local fallback. Follow-up
  branch `mileagetool:codex/tkt-152-retire-estimator` removes the desktop point estimate;
  its documented blocker is the absence of a staff-authenticated/user-delegated route or
  trusted broker that avoids embedding an internal Function key. The retained Cloudflare
  source is explicitly historical/non-active and prohibited as a mileage deployment path.
  Exact sibling heads and gates are recorded in the
  [sibling consolidation evidence](./evidence/sibling-consolidation-2026-07-12.md).

## Review hardening

- Unknown numeric odometer units now make the history ambiguous and force abstention;
  unread/missing odometers remain preserved evidence without poisoning the estimate.
- Interpolation is allowed only across an included, non-negative trusted interval. A reset,
  rollback, keying anomaly or excluded interval cannot produce a point by interpolation.
- Cohort selection now matches deterministic vehicle-type, age, fuel and make/model keys,
  with explicit generic fallback and stable specificity/sample/version tie-breaking. An
  unrelated first prior can no longer win by file order.
- A vehicle whose first-use date predates its registration date is treated as imported or
  previously used and cannot receive a registration-anchor backcast.
- MOT observations now have a composite foreign key to a provider snapshot from the same
  lookup run, closing the cross-run evidence-integrity gap in both fresh and delta DDL.
- Every successful HTTP response now uses the canonical versioned envelope, including
  gate-off and fail-soft outcomes. TypeScript consumers validate the runtime contract before
  persistence; invalid envelopes are rejected/audited rather than trusted through a cast.

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

- `functions/enrichment`: `python -m pytest -q` → **57 passed**.
- Python compile/import gate (`compileall`) → pass.
- Data API: TypeScript build → pass; Vitest → **64 files / 624 tests passed**.
- Orchestration: TypeScript build → pass; Vitest → **30 files / 417 tests passed**.
- Domain contract suite → **56 files / 1,136 tests passed** after runtime validation tests.
- Sibling connector: typecheck/build pass; Vitest → **9 files / 55 tests passed** at
  commit `c629a6a0822247ab3c40409eea7f67add7b368a9`.
- Sibling Windows tool: `BuildAndRun.ps1 -SkipRun` → **0 warnings / 0 errors** at
  commit `2e24802417ff122e7cc0c0dd66e608c17eb0f7a2`.
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
- The sibling MCP and Windows changes are pushed but not merged or deployed. Until those
  delivery units land, their current default branches remain unchanged and suite-wide live
  consolidation cannot be claimed. The historical Cloudflare source remains textually present
  but explicitly non-active and is not an authorised deployment target.
