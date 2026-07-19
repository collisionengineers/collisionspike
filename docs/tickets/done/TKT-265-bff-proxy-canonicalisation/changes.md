# Changes — TKT-265: Retire dead orchestration parser and location client exports

## Status

Implemented on branch `plan008/canonical-routes`. Deletion-only; behaviour-preserving; no live write.

## What changed

In `services/orchestration/src/adapters/functions-client.ts` only:
- Removed the dead `callParser` export (no production caller — the parser capability is served by the
  staff BFF `POST /api/parser/parse`). The `/* parser */` heading and the `PARSER` target stay (the
  active `callClassifyEmail` / `callExtractImages` / `callExplodeEml` use them).
- Removed the dead `callLocationSuggest` export and its `location-suggest` section (location is served by
  the BFF `POST /api/location-assist/suggest`).
- Removed the now-unreferenced `LOCATION` target and the `LOCATION_FN_URL/LOCATION_FN_KEY` header
  documentation. **No** `LOCATION_FN_*` fallback or replacement setting was added.
- Added `functions-client.deadexports.test.ts`: asserts neither export exists on the module, the source
  no longer references `LOCATION_FN_*`, and the active parser/EVA exports remain — a negative
  reintroduction guard (A4).

Data-api's identically-named BFF functions (`service-client.ts` `callParser`/`callLocationSuggest`, which
use `LOCATION_SUGGEST_FN_*`) are the ACTIVE ones and were **not** touched.

## Safety

Call-site inventory confirmed the two orchestration exports had zero source callers (only compiled
`dist/`). The SPA transports (`POST /api/parser/parse`, `/api/location-assist/suggest`), the BFF routes,
staff auth, gates, downstream Function routes, and every app-setting name are unchanged. Net −8 source
lines in `functions-client.ts`.
