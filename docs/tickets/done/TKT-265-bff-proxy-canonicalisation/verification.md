# Verification — TKT-265: Retire dead orchestration parser and location client exports

## Verdict

TESTED (offline). Verified 2026-07-20 on branch `plan008/canonical-routes`. Behaviour-preserving; no live write.

## Evidence

- **A1 — dead exports proven unused.** A repository call-site inventory (`grep callParser|callLocationSuggest`
  across services/apps/packages) found the orchestration exports referenced only by compiled `dist/`. The
  SPA parser transport calls `POST /api/parser/parse` and the location transport `POST /api/location-assist/suggest`
  (both the staff BFF), not the orchestration client.
- **A2 — only the dead exports/const/doc removed.** `callParser`, `callLocationSuggest`, the `LOCATION`
  target, and the `LOCATION_FN_*` header line are gone; no `LOCATION_FN_*` fallback or replacement setting
  was added; data-api's `LOCATION_SUGGEST_FN_*` BFF path is untouched.
- **A3 — nothing observable changed.** `npm run check:runtime-contract` PASS (routes/shapes/auth/Function
  names/app-setting names unchanged); data-api + orchestration + web build.
- **A4 — reintroduction guarded.** `functions-client.deadexports.test.ts` (3/3 pass) asserts the exports are
  absent and the source no longer references `LOCATION_FN_*`.
- **A5 — net negative, no live write.** −8 source lines (plus a small guard test); no live mutation.

## Pending / gaps

None.

## How to re-verify

`node --test` / `npx vitest run functions-client` (3/3, incl. dead-exports); `npm run check:runtime-contract`
(PASS); re-run the `callParser`/`callLocationSuggest` call-site grep (source hits only in the guard test);
build both services and the web app.
