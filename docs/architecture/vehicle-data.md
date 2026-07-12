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
TKT-151 owns applying that result to a case and plain-language warnings; it does not
own this algorithm.

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
| `orchestration/src/functions/activities/enrich.ts` | Active Function caller | Sole runtime caller; consumes the shared `VehicleDataEnrichmentResponse` and forwards it unchanged. |
| `orchestration/src/lib/data-api.ts` and `api/src/functions/internal.ts` | Case-application caller | Consume the shared response type. The current fill-if-empty projection is TKT-151-owned and contains no lookup/cleaning/estimation rule. |
| `api/src/lib/functions-client.ts` and `orchestration/src/lib/functions-client.ts` | Unused legacy enrichment clients (`/api/enrich`) | Obsolete exports removed; they can no longer become a second runtime path. |
| `packages/domain/src/contracts/vehicle-data.ts` | Shared TypeScript consumer response shape | Mechanical consumer view of the root JSON Schema, guarded by a parity test; no provider or estimator logic. |
| `mockup-app/src/data/enrichment-client.ts` | Disabled UI transport shape | No provider HTTP/cache/calculation; its default transport returns unavailable and is not a source of case mileage. |
| `packages/domain/.../vrm-canon.ts` | General case/search comparison form | Not a provider client. The external boundary still re-canonicalises in the owning service. |
| sibling `active/connectors/dvla-dvsa-connector/server/src/` | Active MCP service previously contained copied TypeScript current-mileage and plausibility maths | Follow-up branch `codex/tkt-152-canonical-mileage-adapter` removes that maths. The MCP server calls `vehicle-data.v1`, validates its versioned envelope and derives only observed-vs-canonical-bounds wording. It fails closed when the canonical service is not configured; it has no local estimate fallback. |
| sibling `active/connectors/dvla-dvsa-connector/cf-worker/src/` | Historical Cloudflare implementation still contains an older copied estimator | Explicitly historical/non-active in that repository and prohibited as a mileage deployment source. Its retained source is not an authorised runtime alternative to `vehicle-data.v1`. |
| sibling `active/mileagetool/RegLookup/` | Standalone Windows lookup application previously exposed a copied C# target/current-mileage estimate | Follow-up branch `codex/tkt-152-retire-estimator` removes the estimate model, service method and UI result. Raw provider lookup and factual interval/anomaly display remain. A safe canonical desktop adapter is blocked until a staff-authenticated/user-delegated route or trusted broker exists; an internal Function key must not be embedded in the desktop app. |

This establishes one active handwritten estimator across the suite once the two sibling
follow-up branches are merged and deployed. Those sibling branches are separate delivery
units, not part of this repository's runtime until then. The historical Cloudflare tree
remains as labelled reference source only and must not be restored as an active mileage
path.

## Official source contract

DVSA's current v1 API returns MOT tests under `motTests`; fields include test number,
completion date, result, original odometer value/unit/result type and registration at
the time of test. The bulk documentation warns callers to sort across sources and
explains why registration-at-test matters for cherished transfers. The canonical
cleaner therefore stores the raw row unchanged, accepts current `READ` plus the `OK`
value present in DVSA examples/older exports, converts only recognised MI/KM units,
and records every rejection or consolidation decision.

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
6. Return exact observations on exact MOT dates; bounded interpolation between trusted
   same-segment observations; current-segment forecast after the latest; guarded
   cohort-assisted backcast before the first MOT.
7. Default forecast horizon is two years. Beyond the validated calibration horizon,
   return insufficient evidence.
8. Prediction intervals come only from chronological holdout residual buckets. Without
   an eligible bucket, return a non-probabilistic range and say it is uncalibrated.

## Immutable persistence

`vehicle_lookup_run`, `vehicle_provider_snapshot`, `mot_odometer_observation`,
`mileage_estimate_result` and `mileage_model_profile` hold the complete evidence trail.
They are forced-RLS, append-only tables for the application login. This lets a later
case application reference the exact lookup/model versions without rewriting history.
