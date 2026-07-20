# Changes — TKT-262: Consolidate the active focused-Function clients onto one

## Status

Implemented 2026-07-20 on branch `plan008/tkt-262-focused-fn-client`. Behaviour-preserving; both
services build, all three affected suites pass, `check:runtime-contract` byte-identical.

## What changed

The two hand-rolled focused-Function transports (orchestration `callFunction`, data-api `callFn`)
shared one ~40-line skeleton — build URL from base + key, set `x-functions-key`, JSON-encode a body,
check `res.ok`, on non-2xx throw, else `res.json()` — behind divergent, load-bearing error/timeout
contracts. That skeleton is now one owned module; the two per-service files stay as the public
surface every caller and every `vi.mock()` targets, and only their private transport internals were
swapped.

### Added

- `packages/server-runtime/src/focused-function-client/index.ts` — the `x-functions-key` sibling of
  the MSI-bearer `data-api-http-core`. Exposes:
  - `focusedFnRequest<T>()` — error-neutral transport: caller-resolved `baseUrl`/`functionKey`,
    `path` appended verbatim, `Content-Type` only when a body is present, `x-functions-key` only when
    a key is present, opt-in `AbortController` timeout (`undefined` ⇒ unbounded), `emptyOn204`, and a
    caller-supplied `mapError` + optional `onTimeout`. It adds **no** retry (orchestration relies on
    the Durable retry policy; the Data API on best-effort caller `try/catch`).
  - `FocusedFnErrorMapper` type; `FunctionCallError` (moved here — the shared typed error);
    `FN_STAGE_TIMEOUT_MS`; and `PlateOcrResult` (the literal duplicate).
- `packages/server-runtime/src/focused-function-client/index.test.ts` — contract test of the seam:
  header/body policy, no-timeout ⇒ no signal, `emptyOn204`, the orchestration body-retaining mapper
  vs the Data-API status-only `FunctionCallError` mapper, and abort ⇒ `onTimeout`.
- `packages/server-runtime/package.json` — new `./focused-function-client` subpath export.
- `services/{data-api,orchestration}/vitest.config.ts` — subpath alias to the package `src`.

### Changed

- `services/orchestration/src/adapters/functions-client.ts` — `callFunction` now delegates to
  `focusedFnRequest`, passing `baseUrl = base.replace(/\/$/,'')`, `path = /api/<route>`,
  `emptyOn204: true`, `label = <short route>`, and an `includeBodyErrorMapper` that RETAINS the
  upstream body — the thrown message `fn <method> <route> → <status>: <body≤500>` is byte-identical
  (the `label` preserves the short route). Local `PlateOcrResult` removed and re-exported from the
  shared module. Every typed wrapper (`callClassifyEmail`, `callEvaSubmit`, the `box.*` object, …)
  is untouched.
- `services/data-api/src/platform/http/service-client.ts` — `callFn` now delegates to
  `focusedFnRequest` with a `statusOnlyErrorMapper` that DRAINS and DISCARDS the body and throws
  `FunctionCallError(status)`, and an `onTimeout` reproducing `[functions-client] <method> <path> →
  timed out after <ms>ms`. Local `FunctionCallError`, `FN_STAGE_TIMEOUT_MS`, and `PlateOcrResult`
  removed and re-exported from the shared module for back-compat. Every typed wrapper unchanged.

## Invariants preserved

- **App-settings untouched at their boundaries:** `PARSER_FN_*`, `OCR_FN_*` (shared names),
  `ENRICH_FN_*`, `LOCATION_SUGGEST_FN_*`, `BOX_FN_*` (data-api), `BOXWEBHOOK_FN_*`, `EVASENTRY_FN_*`
  (orchestration). `BOXWEBHOOK_FN_*` and `BOX_FN_*` are NOT unified; no `LOCATION_FN_*` fallback was
  introduced (the TKT-265 deadexports guard still passes).
- **Divergent contracts kept opposite:** orchestration retains the error body; the Data API discards
  it. Timeout stays opt-in (unbounded parser/enrich/interactive-location vs bounded OCR/location/Box).
  No retry added. The one benign normalisation is data-api GETs no longer send an inert
  `Content-Type` (no test or wire behaviour depends on it; the only exact-header assertion is on a
  POST-with-body).
- **DTOs:** client-only DTOs stay co-located with each service's wrappers; only the genuinely shared
  `PlateOcrResult` / `FunctionCallError` / `FN_STAGE_TIMEOUT_MS` moved into the server-runtime
  subpath. `VehicleDataEnrichmentResponse` stays in `@cs/domain`. No internal DTO went to root
  `contracts/`.

## Delta

`git diff --numstat` over `packages/` + `services/`: +337 / −76 (net **+261** raw lines). The delta
is positive because the ticket introduces a new shared module (120 lines) and its contract test
(141), against ~60 lines of collapsed transport duplication — the same shape as the operator-waived
PLAN-007 net delta (new primitive + guard). Per PLAN-008/PLAN-012's structural-delta rule, a single
lane's positive delta is not a rejection; the plan **aggregate** is the gate (TKT-263/265 removed dead
code; TKT-264 removes duplicate monitor lifecycle next).
