# Changes — TKT-249: Consolidate the Data-API HTTP core and add one bounded-retry primitive

## Status
verify — implemented on branch `plan007/server-runtime` (commit 7209bd9d).

## Files added / changed
- `packages/server-runtime/src/{data-api-http-core.ts, retry.ts, managed-identity.ts (relocated), index.ts (barrel)}` + their tests
- `services/orchestration/src/adapters/{data-api-http, provider-archive-api, archive-mirror-api, box-maintenance-api}.ts` (+ archive-mirror test)
- `services/data-api/src/features/assistant/chat-client.ts`

## Summary
One HTTP transport core + one bounded-retry primitive in `@cs/server-runtime`; the four wrappers delegate
while preserving each observable error contract; chat-client's one-shot retry flows through `withRetry` with
no stacking. Net-LOC is positive because of the net-new retry primitive + tests (operator-accepted).
