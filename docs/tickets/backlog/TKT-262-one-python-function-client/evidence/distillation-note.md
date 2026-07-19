# Distillation note — TKT-262

**Source:** `workingspace/architecture-simplification/02-canonical-service-routes.md` step 2 (findings C,
D). **Plan:** PLAN-008. Corrected against current source and read-only live configuration on 2026-07-19.

**Two Python-function clients (finding C):**
- `services/orchestration/src/adapters/functions-client.ts` — transport `callFunction()` (throws on non-2xx
  for Durable retry); active callers use parser `classify-email`/`extract-images`/`explode-eml`, OCR
  `plate-ocr`/`ocr-pdf`, EVA submit, and the Box facade. `callParser` and `callLocationSuggest` have no
  production caller and are removed by TKT-265 rather than migrated.
- `services/data-api/src/platform/http/service-client.ts` — transport `callFn()` (typed `FunctionCallError`,
  optional AbortController timeout); covers vehicle-data enrich (unique), parser, location-suggest, plate-OCR,
  Box ops.
- Divergent: transport helpers and error semantics. Live data-api settings include `BOX_FN_*` and
  `LOCATION_SUGGEST_FN_*`; orchestration includes `BOXWEBHOOK_FN_*` and no `LOCATION_FN_*`. The shared client
  therefore takes injected service-owned targets and does not rename live settings.

**Finding D:** the Box duplication is the two TS **facades** (orchestration `export const box = {…}` L278-441;
data-api free functions L186-445), not the SDK — the CCG token mint lives once in
`services/functions/box-webhook/box_client.py`. So D collapses with the single client, not separately.

**Migrate onto** PLAN-007's `@cs/server-runtime` request/retry primitives. Client-only DTOs stay with that
server-only client; `contracts/README.md` explicitly reserves root `contracts/` for external wire schemas and
points internal TypeScript DTOs to `@cs/domain`.
