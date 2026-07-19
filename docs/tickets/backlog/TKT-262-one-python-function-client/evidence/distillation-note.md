# Distillation note — TKT-262

**Source:** `02-canonical-service-routes.md` step 2 (findings C, D). **Plan:** PLAN-008. Re-verified read-only
2026-07-19 (`PLAN-008.dossier.json`).

**Two Python-function clients (finding C):**
- `services/orchestration/src/adapters/functions-client.ts` — transport `callFunction()` (throws on non-2xx
  for Durable retry); covers parser `parse`/`classify-email`/`extract-images`/`explode-eml`, OCR
  `plate-ocr`/`ocr-pdf`, EVA submit, location `suggest`, full Box facade.
- `services/data-api/src/platform/http/service-client.ts` — transport `callFn()` (typed `FunctionCallError`,
  optional AbortController timeout); covers vehicle-data enrich (unique), parser, location-suggest, plate-OCR,
  Box ops.
- Divergent: transport helpers, env-var names (`LOCATION_FN_URL` vs `LOCATION_SUGGEST_FN_URL`), error semantics.

**Finding D:** the Box duplication is the two TS **facades** (orchestration `export const box = {…}` L278-441;
data-api free functions L186-445), not the SDK — the CCG token mint lives once in
`services/functions/box-webhook/box_client.py`. So D collapses with the single client, not separately.

**Migrate onto** PLAN-007's `@cs/server-runtime` request/retry primitives; shared types → `contracts/`.
