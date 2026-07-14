# Changes — TKT-152: Consolidate vehicle lookups and harden the MOT mileage estimator

## Status
Implemented and offline-tested on `codex/tkt-152-canonical-mileage` (2026-07-12).
Not deployed and not made the live default in this ticket branch. A production-scale
chronological calibration profile, deployment, controlled remediation and independent
live verification still gate completion. TKT-151 application/persistence is now built
and offline-tested in the same branch, but remains undeployed.

Current reviewed sibling delivery heads:

- DVLA/DVSA MCP adapter: `03c7b35ce94b379c6e0fa6efca2e1c61a0d6f008` (PR 3)
- Retired Windows mileage tool: `1e9a00e720a03ed0cf576a4a3c95ae7a0f59178a` (PR 1)

The CollisionSpike delivery is PR 78; its exact passing reciprocal-review head is
recorded by the PR marker rather than self-referenced inside its own commit.

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
- Interpolation uses monotonic same-segment observations independently of whether their
  gap is eligible for annual-rate fitting. Short retests and long gaps can bound the target
  safely; resets, rollbacks and cross-segment endpoints cannot.
- Cohort selection uses official response fields only: `firstUsedDate`, fuel and make/model.
  The live response exposes no vehicle type, so type-specific priors cannot match and the
  deterministic generic fallback wins instead of inventing a type.
- A registration backcast is permitted only when `firstUsedDate` and `registrationDate`
  are both present and equal. It is exactly zero at that verified new-at-registration
  anchor and linear to the first MOT; imported/pre-used/missing anchors abstain.
- MOT observations now have a composite foreign key to a provider snapshot from the same
  lookup run, closing the cross-run evidence-integrity gap in both fresh and delta DDL.
- Every successful HTTP response now uses the canonical versioned envelope, including
  gate-off and fail-soft outcomes. TypeScript consumers validate the runtime contract before
  persistence; invalid envelopes are rejected/audited rather than trusted through a cast.
- Exact-head PR review additionally hardened at-least-once delivery: request identity
  excludes state the lookup itself mutates, the first response committed for an identical
  caller key wins even if concurrent retrieval timestamps differ, excluded MOT outliers
  cannot remain selected, and invalid legacy mileage exposes Case Detail retry.
- App-only vehicle lookup now requires the live orchestration identity in
  `VEHICLE_DATA_SERVICE_CLIENT_IDS`; staff retain their normal app-role path. The activity
  forwards its resolved registration as a missing-case fallback and conflicting saved
  registrations fail closed. The route now has direct auth, validation, preview, fallback,
  conflict and replay tests.
- Calendar dates are validated as real dates, not just digit shapes, at both the
  Data API and sibling MCP boundaries. A concurrent idempotency loser reloads and
  returns the first committed envelope rather than merely labelling its own response
  as replayed.
- Machine/provider mileage retains compatibility with an exact standalone unit suffix,
  while case edits and arbitrary surrounding prose remain strict. The remediation client
  verifies the Postgres certificate by default.
- Invalid oversized registrations now remain fail-soft and schema-valid without truncating
  into a different plausible vehicle. Durable replay digests use the canonical registration,
  so an equivalent spaced saved value cannot conflict with its first attempt. Provider
  mileage suffixes infer their unit when absent and fail closed when an explicit unit conflicts.
- Rebased onto `main` at `da56628` after the manual-source, status-language, website-enquiry
  and subsequent mainline deliveries.
  The semantic merge preserves pending/failed source-evidence readiness, resumable Manual
  Intake uploads, explicit-save behavior, bounded e-mail previews and the new vehicle checks
  in the same canonical readiness result. Sparse legacy case fixtures remain safe.
- Intake vehicle completion is now explicitly advisory: bounded replay keys hash arbitrarily
  long Graph instance identifiers, permanent Data API rejections skip immediately, transient
  faults use the Durable retry window, and an exhausted retry cannot roll back an already
  committed case/evidence intake.
- Case Detail disables vehicle re-check while a draft is dirty and adopts the complete returned
  case snapshot (including optimistic version) after success. Manual Intake treats lookup data
  as defaults only: parsed or staff-entered model/make and valid mileage/unit values are kept,
  while an absent or invalid mileage may be repaired.
- Exact target-date MOT observations now win before unrelated unknown-unit rows can force an
  abstention. Empirical results carry the complete immutable calibration profile; persistence
  stores that profile rather than the selected interval and keys profiles by `(kind, version)`
  so cohort and calibration releases may legitimately share a version label.
- Handler warnings now translate estimator diagnostics into task-focused guidance and suppress
  the deliberate document-mileage skip. The remediation census includes invalid non-empty
  mileage, and classifier parity pins all 9 categories plus all 15 emitted subtypes rather than
  accepting coordinated shrinkage. Both checked-in deployment bundles were regenerated.
- Final exact-head review also keeps manual-preview copy on the same staff-safe boundary,
  clamps rounded estimates and intervals inside observed MOT endpoints, and rejects a reused
  model-profile version when its immutable profile content differs even if its dataset label is
  unchanged.

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
  quantiles can emit an empirical prediction interval. Without one, a defensible normal
  point estimate remains visible with a wider explicitly uncalibrated range, but is
  not exposed to legacy/default case-field writers.
- Automatic estimate application additionally requires at least 1,000 empirical
  chronological holdouts, observed coverage at or above the declared target and the
  explicit `MILEAGE_ESTIMATE_AUTOFILL_ENABLED` rollout gate. Synthetic fixtures cannot
  authorise it.
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

- `functions/enrichment`: `python -m pytest -q` → **67 passed**.
- Python compile/import gate (`compileall`) → pass.
- Data API: TypeScript build → pass; Vitest → **70 files / 709 tests passed**.
- Orchestration: TypeScript build → pass; Vitest → **32 files / 425 tests passed**.
- Domain contract suite → **58 files / 1,166 tests passed** after exhaustive runtime validation and readiness tests.
- SPA: TypeScript/Vite build pass; Vitest → **46 files / 505 tests passed**.
- Vehicle-remediation guard: Node test runner → **2 tests passed**.
- Sibling connector: typecheck/build/stdio bundle pass; Vitest → **2 files / 6 tests passed** at
  reviewed head `03c7b35ce94b379c6e0fa6efca2e1c61a0d6f008`.
- Sibling Windows tool: direct `dotnet build` → **0 warnings / 0 errors** at reviewed head
  `1e9a00e720a03ed0cf576a4a3c95ae7a0f59178a`.
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
- TKT-151 application/persistence/readiness/retry is implemented offline in this branch;
  it still needs migration/deployment, controlled found/not-found proof, backup-first
  remediation and the final residual census.
- Durable orchestration retries now share one caller key; the Data API stores and
  verifies request/response digests, replays the first validated envelope and does not
  duplicate audit or provenance. MOT persistence now writes `completed_date_raw`,
  episode/segment numbers, booleans and the actual contract decision codes.
- The sibling MCP and Windows changes are committed but not yet merged or deployed. Until those
  delivery units land, their current default branches remain unchanged and suite-wide live
  consolidation cannot be claimed. The historical Cloudflare runtime and desktop duplicate
  implementation are removed from their delivery branches.
