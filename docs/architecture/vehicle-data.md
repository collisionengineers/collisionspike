# Canonical vehicle data and displayed-mileage estimation

## Decision

The CollisionSpike case workflow has one vehicle-data owner:
[`functions/enrichment/vehicle_data/`](../../functions/enrichment/vehicle_data/).
The retained enrichment Function is the service boundary. Provider credentials and
HTTP details remain in its DVSA/DVLA transport adapters; every caller receives the
versioned [`vehicle-data.v1`](../../contracts/vehicle-data-v1.schema.json) contract.

No Data API, orchestration or UI caller may clean MOT rows, calculate an annual rate,
choose a mileage point, or label confidence independently. The temporary top-level
response fields are produced by one mechanical adapter in `vehicle_data/service.py`.
The Data API owns applying that result to a case, immutable evidence persistence,
plain-language warnings and retry. It does not own this algorithm.

## Repository and sibling inventory

| Surface | Previous role | Decision |
|---|---|---|
| `functions/enrichment/vehicle_data/service.py`, `contracts.py` and root `contracts/vehicle-data-v1.schema.json` | New owner/service/response model | Sole case-workflow service and authoritative versioned contract; raw payload digests, typed provider outcomes, model versions and compatibility projection live here. |
| `functions/enrichment/vehicle_data/mileage.py` | New cleaner/estimator | The only handwritten case-workflow MOT cleaner, segmenter and estimator. |
| `functions/enrichment/vehicle_data/registration.py` | New provider-boundary normaliser | Sole normal form used before either provider call. |
| `functions/enrichment/dvsa_client.py` | Provider client, Entra token response and in-process token cache | Transport/auth/cache only; registration cleanup delegates to `vehicle_data/registration.py`; raw vehicle/MOT response passes unchanged to the service. |
| `functions/enrichment/dvla_client.py` | Provider client and DVLA fallback response | Transport/auth only; registration cleanup delegates to `vehicle_data/registration.py`; no MOT or mileage logic. |
| `functions/enrichment/analysis.py` | Copied TypeScript cleaner/estimator and response model | Retired to a no-maths import facade over the canonical package. |
| `functions/enrichment/function_app.py` | Function route and former calculation caller | Sole HTTP service boundary; invokes `VehicleDataService` once and emits the canonical envelope plus its temporary mechanical projection. |
| `api/src/functions/vehicle-data.ts` and `api/src/lib/vehicle-data-persistence.ts` | Authenticated owner of lookup application | One route serves orchestration, Manual Intake and explicit retry. It validates the canonical response, persists its complete append-only evidence, applies only empty compatibility fields and stores the current warning/outcome pointer. |
| `orchestration/src/functions/activities/enrich.ts` | Automated intake caller | Calls the one Data API route for every provider automation mode. It has no provider credentials, HTTP client, cleaning or estimation rule. |
| `api/src/lib/functions-client.ts` and `orchestration/src/lib/functions-client.ts` | Unused legacy enrichment clients (`/api/enrich`) | Obsolete exports removed; they can no longer become a second runtime path. |
| `packages/domain/src/contracts/vehicle-data.ts` | Shared TypeScript consumer response shape | Mechanical consumer view of the root JSON Schema, guarded by a parity test; no provider or estimator logic. |
| `mockup-app/src/data/rest-client.ts` | Staff/manual caller | Uses the same authenticated route for Manual Intake preview and Case Detail retry. The old disabled vehicle placeholder transport is removed. |
| `packages/domain/.../vrm-canon.ts` | General case/search comparison form | Not a provider client. The external boundary still re-canonicalises in the owning service. |
| sibling `active/connectors/dvla-dvsa-connector/server/src/` | MCP service previously contained direct clients, copied mileage/plausibility rules, cache and snapshots | Branch `codex/tkt-152-canonical-mileage-adapter` is a thin exhaustive `vehicle-data.v1` adapter only. Raw tools expose captured provider snapshots without inference. The direct clients, copied rules, storage/workspace/pack surfaces and historical Cloudflare runtime are removed. |
| sibling `active/mileagetool/RegLookup/` | Standalone Windows lookup application previously contained direct clients, embedded credential generation and copied mileage/anomaly rules | Branch `codex/tkt-152-retire-estimator` removes every lookup client/model/rule and credential target. The remaining WinUI shell directs staff to CollisionSpike Case Intake. |

This establishes one active handwritten estimator and one provider client pair across
the suite once the two sibling delivery units are merged and deployed.

## Official source contract

DVSA's current v1 API returns MOT tests under `motTests`; fields include test number,
completion date, result, original odometer value/unit/result type and registration at
the time of test. The bulk documentation warns callers to sort across sources and
explains why registration-at-test matters for cherished transfers. The canonical
cleaner therefore stores the raw row unchanged, accepts current `READ` plus the `OK`
value present in DVSA examples/older exports, converts only recognised MI/KM units,
and records every rejection or consolidation decision. The official live response has
`firstUsedDate`, `registrationDate`, make, model and fuel type; it does not expose a
vehicle-type field. Cohort age/import checks therefore use `firstUsedDate`, while
type-specific priors are ineligible unless a future official response exposes that fact.

References:

- [DVSA MOT History API v1 specification](https://documentation.history.mot.api.gov.uk/mot-history-api/api-specification/)
- [DVSA bulk file fields and vehicle-identity warning](https://documentation.history.mot.api.gov.uk/mot-history-api/download-vehicle-mot-history-data/bulk-file-formats/)
- [DfT odometer methodology](https://assets.publishing.service.gov.uk/media/5a7c729c40f0b626628ac212/experimental-statistics-mot-data.pdf)

## Estimation rules

1. Preserve all observations; order, deduplicate and consolidate fail/retest episodes.
2. Normalise recognised miles/kilometres. Unknown/contradictory units remain visible
   and block an unsafe result.
3. Exclude intervals under 90 days, over 100,000 annualised miles, negative changes
   and gaps over 900 days from rate estimation without deleting the evidence.
4. Exclude only corroborated isolated spikes/dips. Persistent lower readings start a
   new displayed-odometer segment. An unresolved final drop abstains.
5. Use a recency/quality-weighted median of clean rates. Blend a versioned cohort
   prior only for sparse histories and only when its sample/version checks pass.
6. Return exact observations on exact MOT dates; bounded interpolation between monotonic
   same-segment endpoints even when their gap is outside the rate-estimation window;
   current-segment forecast after the latest; guarded
   cohort-assisted backcast before the first MOT.
7. Default forecast horizon is two years. Beyond the validated calibration horizon,
   return insufficient evidence.
8. Prediction intervals come only from chronological holdout residual buckets. Without
   an eligible bucket, keep a defensible point estimate for normal fill-in, return a
   wider non-probabilistic range and explicitly say it is uncalibrated.

## Immutable persistence

`vehicle_lookup_run`, `vehicle_provider_snapshot`, `mot_odometer_observation`,
`mileage_estimate_result` and `mileage_model_profile` hold the complete evidence trail.
They are forced-RLS, append-only tables for the application login. This lets a later
case application reference the exact lookup/model versions without rewriting history.
