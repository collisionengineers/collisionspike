# Verification — TKT-077: Location assist can't see the case photos — real photo bytes + signage business lookup

## Verdict
DEPLOYED (2026-07-06) — the photo path is now real. Live E2E telemetry probe of a photo case is the
operator's (the Function is function-key-gated behind the API proxy; the API HTTP is bearer-gated).

## Root cause fixed
`get_photo_source()` returns the **raising** `BoxPhotoSource` under `BOX_API_ENABLED=true`, so the live
assist got zero photo bytes and ran on text clues only. Fixed by resolving bytes in the Data API
(chosen approach) and passing them inline — no Box grant on the location function.

## Offline tests (python location-suggest — 75 pass)
- `tests/test_photo_source.py`: `InlinePhotoSource` decodes base64 / raises on missing or bad base64;
  `select_photo_source` prefers inline bytes over the (raising) Box source even with `BOX_API_ENABLED=true`,
  falls back to the Stub/Box factory without inline bytes.
- `tests/test_vision_maps_clients.py`: `MapsClient.search_poi` hits the `/search/fuzzy/json` endpoint
  (business names off signage), UK-biased.
- The full existing suite (handler happy path, 422/502, ranking) re-passes with the new `select_photo_source`.

## api (183 pass) + build
- `api/src/lib/evidence-bytes.ts` (shared blob→Box-facade resolver, extracted from `evidence.ts` and reused
  in `proxy.ts`), `resolveAssistImageBase64` (capped 4 photos / 4.5MB each). `evidence.ts` refactored to the
  shared resolver (TKT-048 previews unchanged). tsc clean; SPA build clean.

## Deployed
- Location fn `cespkloc-fn-a7tzj2` (Oryx remote build, host Running, `location-suggest` registered).
- api `cespk-api-dev` (82 functions) — the proxy now enriches `photo_refs` with `image_base64`.
- SPA — CaseDetail auto-runs the assist once on a corpus miss with photos (suggest-only).

## Pending (operator)
Live E2E: replay a photo case through the deployed stack and confirm via App Insights that the assist
read real bytes (Vision OCR ran) + a candidate returned; a Postgres check that nothing was auto-applied
(no inspection_decision written by the assist). Signage POI path probe.

## Deferred (noted follow-up)
`corpus_match` (cross-referencing an AI/POI hit against the provider's corpus sites) needs the provider's
sites passed into the request — a larger contract change; the `corpus_match` evidence kind already exists
for forward-compat. Full narrative: `LIVE_FACTS.json` `verifiedBy`.

## Verdict update — 2026-07-10 (final sweep, ticket-verifier dispatch; transcribed verbatim)

**PENDING.** Deployment intact through the 07-09/07-10 api redeploys: `resolveAssistImageBase64` + `image_base64` in the deployed api bundle; `locationAssistSuggest`/`getLocationAssistGate` in the live 96-fn list; `LOCATION_ASSIST_ENABLED=true` + `AZURE_MAPS_ENABLED=true` + `LOCATION_SUGGEST_FN_URL` on `cespk-api-dev`; `cespkloc-fn-a7tzj2` Running with Vision (`cespkvision-dev`) + Maps (GB) wired. Loc-fn `BOX_API_ENABLED=False` is correct by design (the Box fallback lives in the api-side `evidence-bytes.ts` resolver). Gaps unchanged, operator/auth-bound: live E2E photo-path probe; box-only-evidence case; signage POI probe; auto-run-once SPA observation; the no-auto-apply Postgres check (queued: audit actors on inspection writes — expect all human). Note: TKT-078's flip means the same fn now carries a live `deep=true` branch — no effect on these lines. Verified by: ticket-verifier dispatch, 2026-07-10.

### W7 data-pass result (orchestrator-run, 2026-07-10)
The no-auto-apply check PASSED: inspection-write audit actors are system-blank (326), the 07-08
image-based prefill delta (224), and one staff principal (2) — **no assist actor exists**; all
inspection decisions are human. Remaining: the operator/auth-bound probes (photo-path E2E, box-only
case, signage POI, auto-run-once).
