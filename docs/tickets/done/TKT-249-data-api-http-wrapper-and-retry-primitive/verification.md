# Verification — TKT-249: Consolidate the Data-API HTTP core and add one bounded-retry primitive

## Verdict
TESTED (offline).

## Evidence
- One error-neutral `request()`/`post()` core in `@cs/server-runtime`; the four wrappers delegate keeping
  their exact error contracts — `data-api-http.ts` keeps typed 409 / `DataApiHttpError` / `EvidenceBackfill*`
  + 204; `provider-archive-api.ts` and `archive-mirror-api.ts` keep a plain `Error` on non-2xx including 409
  (new archive-mirror test proves `internalArchiveMirrorOutboxComplete` 409 stays a plain Error);
  `box-maintenance-api.ts` keeps its POST-only 60s AbortController (A1).
- One bounded-retry primitive `withRetry()`: explicit retryable set 408/429/500/502/503/504, `Retry-After`
  honoured on 429/503 over jittered exponential backoff, finite cap, optional `shouldRetry` predicate, and
  `maxAttempts:1` = zero layers (no double-retry over an SDK) — unit tests cover all of A2. The `chat-client.ts`
  one-shot tool retry is expressed through it, preserving "retry any tool error once" (incl. the no-HTTP-status
  Postgres cold-connect) with no stacked retry (A3).
- Verified: server-runtime 28 tests; api 1102; orchestration 574; `check:runtime-contract` unchanged (191
  routes, A4); production-dependency boundary holds; bundles smoke-load.
- A5 net-LOC: the wrapper consolidation is negative (services −62); the ticket also adds the net-new bounded-retry
  primitive + its unit tests, so the ticket total is positive (+147). The operator accepted the net-positive at
  the PLAN-007 close-out (2026-07-19), waiving the per-ticket net-negative in favour of the plan-mandated new
  capability.

## Pending / gaps
- None.

## How to re-verify
`npm test --workspace @cs/server-runtime && npm run test --workspace @cs/api && npm run test --workspace @cs/orchestration && npm run check:runtime-contract`.
