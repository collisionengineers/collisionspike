# Verification — TKT-077: Location assist can't see the case photos — real photo bytes + signage business lookup

## Verdict
DEPLOYED (2026-07-06) — the photo path is now real. Live E2E telemetry probe of a photo case is the
operator's (the Function is function-key-gated behind the API proxy; the API HTTP is bearer-gated).

## Root cause fixed
`get_photo_source()` returns the **raising** `BoxPhotoSource` under `BOX_API_ENABLED=true`, so the live
assist got zero photo bytes and ran on text clues only. Fixed by resolving bytes in the Data API
(chosen approach) and passing them inline — no Box grant on the location function.

## Offline tests (python location-suggest — 75 pass)
- `services/functions/location-assist/tests/test_photo_source.py`: `InlinePhotoSource` decodes base64 /
  raises on missing or bad base64;
  `select_photo_source` prefers inline bytes over the (raising) Box source even with `BOX_API_ENABLED=true`,
  falls back to the Stub/Box factory without inline bytes.
- `services/functions/location-assist/tests/test_vision_maps_clients.py`: `MapsClient.search_poi` hits
  the `/search/fuzzy/json` endpoint
  (business names off signage), UK-biased.
- The full existing suite (handler happy path, 422/502, ranking) re-passes with the new `select_photo_source`.

## api (183 pass) + build
- `services/data-api/src/features/evidence/bytes.ts` (shared blob→Box-facade resolver, extracted from `evidence.ts` and reused
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
for future-safe behavior. Full narrative: `LIVE_FACTS.json` `verifiedBy`.

## Verdict update — 2026-07-10 (final sweep, ticket-verifier dispatch; transcribed verbatim)

**PENDING.** Deployment intact through the 07-09/07-10 api redeploys: `resolveAssistImageBase64` + `image_base64` in the deployed api bundle; `locationAssistSuggest`/`getLocationAssistGate` in the live 96-fn list; `LOCATION_ASSIST_ENABLED=true` + `AZURE_MAPS_ENABLED=true` + `LOCATION_SUGGEST_FN_URL` on `cespk-api-dev`; `cespkloc-fn-a7tzj2` Running with Vision (`cespkvision-dev`) + Maps (GB) wired. Loc-fn `BOX_API_ENABLED=False` is correct by design (the Box fallback lives in the api-side `evidence-bytes.ts` resolver). Gaps unchanged, operator/auth-bound: live E2E photo-path probe; box-only-evidence case; signage POI probe; auto-run-once SPA observation; the no-auto-apply Postgres check (queued: audit actors on inspection writes — expect all human). Note: TKT-078's flip means the same fn now carries a live `deep=true` branch — no effect on these lines. Verified by: ticket-verifier dispatch, 2026-07-10.

### W7 data-pass result (orchestrator-run, 2026-07-10)
The no-auto-apply check PASSED: inspection-write audit actors are system-blank (326), the 07-08
image-based prefill delta (224), and one staff principal (2) — **no assist actor exists**; all
inspection decisions are human. Remaining: the operator/auth-bound probes (photo-path E2E, box-only
case, signage POI, auto-run-once).

## Verdict update — 2026-07-14 (independent PLAN-005 sweep; transcribed verbatim)

## Verdict

**FAILED** — deployed portions work, but explicit Acceptance item 3 is not implemented: no provider
corpus sites enter the request or Function, and no backend path can emit `corpus_match`.

## Evidence

1. Fresh Azure inspection found `cespkloc-fn-a7tzj2` **Running**, with enabled Python
   `location-suggest` route. Vision and Maps configuration is present; their keys are Key Vault
   references.
2. Read-only KQL found pre-existing live executions:
   - 2026-07-08 operation `9b41c7b4356b165f163c8c939ca1ff94`: Function `200`, Vision image-analysis
     `200`, Maps fuzzy search `200`.
   - 2026-07-06 operation `667a60b9dfed499cf25e4dd9eb5dbfcd`: Function `200`, multiple Vision
     image-analysis `200` calls, Maps fuzzy search `200`.

   This proves the deployed Function has processed image bytes through Vision and POI lookup, but
   telemetry cannot attribute those bytes specifically to blob versus Box.
3. Current main implements blob-first then Box-facade fallback in `services/data-api/src/features/evidence/bytes.ts`,
   injects trusted `image_base64` in `services/data-api/src/platform/http/proxy-routes.ts`, and selects
   `InlinePhotoSource` in `services/functions/location-assist/photo_source.py:127-180`.
4. Current orchestration accepts only photos and two text clues at
   `services/functions/location-assist/location_suggest.py:132-143`. Its evidence constants at lines 62-68 omit
   `corpus_match`; signage goes directly from OCR to fuzzy search at lines 164-220. Repository-wide search
   found `corpus_match` only in UI contract/docs, never in backend production.
5. The ticket's existing verification explicitly acknowledges this deferral at
   `docs/tickets/now/TKT-077-location-assist-photos/verification.md:36-40`.
6. SPA source auto-runs assist once only on corpus miss with usable photos at
   `CaseDetail.tsx:1656-1682`; candidates remain confirm-only at lines 2711-2733. Image Based Assessment
   requires a touched reason at lines 2627-2634.
7. Targeted tests passed:
   - Location Function: **54 passed**
   - API search/proxy: **12 passed**
   - SPA location client/deep-link/date: **42 passed**
8. Existing W7 DB evidence found no assist/system actor applying inspection addresses automatically.
9. Registry prose remains stale: it still describes the old stub-default photo path even though source,
   deployment history, and live telemetry show the inline-byte path.

## Pending / gaps

- **Definite acceptance failure:** provider-site proximity and backend `corpus_match` production do not
  exist.
- No attributable live proof for one blob-backed case and one genuinely Box-only case.
- No signed-in observation of the once-only automatic SPA run.
- Current Postgres was unreadable and no Box descent or production stimulus was attempted.
- Security finding: Function telemetry currently records the Azure Maps request URL with its
  subscription-key query parameter. The key should be rotated and dependency logging sanitized.

## How to re-verify

1. Add provider corpus sites to the trusted API request, implement proximity comparison, and emit
   `corpus_match`; test and deploy.
2. Add non-sensitive byte-source telemetry (`blob` or `box`, without IDs or content).
3. In an operator-sanctioned session, run one existing blob-backed case and one existing Box-only case
   through the signed-in SPA.
4. Correlate API, Function, Vision, and Maps telemetry; verify a POI hit near a provider site returns
   `corpus_match`.
5. Confirm one automatic request on corpus miss, no automatic inspection-address write, manual
   confirmation, and required Image Based Assessment reason.
6. Reconcile the live registry, rotate the exposed Maps key, and remove/redact secret-bearing query
   strings from telemetry.

## Confidence + unread surfaces

**High confidence in FAILED** because the missing contract/input/producer is unambiguous. **Medium
confidence on the otherwise-working byte-source path** because live telemetry proves Vision received
bytes but cannot distinguish blob from Box. Unread surfaces: signed-in assist execution, Box contents,
fresh Postgres state, and byte-source-attributable telemetry.
