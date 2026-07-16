# Changes — TKT-143: Pass the resolved provider/VRM into /extract-images so extraction filenames carry real identity

## Status
built + deployed (2026-07-09, PLAN-003 final wave D1: orch republished 71, parser
republished 4 — vendored engine untouched) — uncommitted on `feat/final-wave`; awaiting a
live resolved-case extraction.

## Commits
(none yet — the wave's work is uncommitted on `feat/final-wave` per the dispatch instructions)

## Files touched
Sibling-first check: the vendored engine (`services/functions/parser/cedocumentmapper_v2`,
`engine-v2.11`) ALREADY composes `<provider>_<vrm>_img_<page>_<n>` stems from its
`fields` argument with the TKT-090 omit-when-unknown rule — **the engine template did not
change** (as the ticket predicted); only the Function-layer adapter + orchestration now
pass the fields.

- `services/orchestration/src/workflows/intake/intakeOrchestrator.ts` — all three `extractImages` call
  sites (attach_case lane, linked-reply lane, main mint lane) now thread
  `providerPrincipal: principalCode` (the providerMatch step-1 result already in scope;
  omitted when unresolved).
- `services/orchestration/src/workflows/evidence/extractImages.ts` — input gains
  `providerPrincipal?`; the parser call passes `provider` = the upper-cased principal and
  `vrm` = `canonicalizeVrm(caseVrm)` (compact form), each ONLY when non-empty.
- `services/orchestration/src/adapters/functions-client.ts` — `callExtractImages` optional
  `provider`/`vrm` body fields (omitted when unknown).
- `services/functions/parser/function_app.py` — `/extract-images` accepts optional `provider` +
  `vrm` strings (blank/non-string degrade to None — identity is additive, never a 400).
- `services/functions/parser/parser_adapter.py` — `run_image_extraction(…, provider=None,
  vrm=None)` builds the engine `fields` dict from ONLY the resolved values (empty dict →
  neutral stems, exactly the TKT-090 behaviour).
- Fixtures/tests: `services/functions/parser/tests/test_extract_images.py` — route-level
  passthrough contract (provider/vrm reach the adapter; blank/non-string ignored) + two
  REAL-engine tests: `provider="QDOS", vrm="AB12CDE"` → stem
  `QDOS_AB12CDE_img_<page>_<n>.<ext>`; VRM-only → `AB12CDE_img_…` (partial identity keeps
  the known token, omits the unknown one). 16/16 passed on the Windows runner.

## Summary
An extraction on a resolved case now names its evidence with real identity
(`QDOS_AB12CDE_img_1_1.png`, then prefixed by the source document name at the blob/
evidence layer as before); unresolved cases keep the neutral `img_<page>_<n>` stems.
Orch suite 234 + parser extract-images suite 16 — green. Deployed: orch (71) + parser (4)
republished 2026-07-09.
