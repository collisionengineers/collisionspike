# Changes — TKT-248: Consolidate the managed-identity token mint across the six bearer-token sites

## Status
implemented (uncommitted on branch `plan007/server-runtime`); ticket not yet moved.

## What changed

### New primitive (`@cs/server-runtime`)
- `packages/server-runtime/src/index.ts` — added `getManagedIdentityToken(audience, options)`,
  the single App Service managed-identity mint. Keeps the EXACT raw `IDENTITY_ENDPOINT` REST
  mechanism (`api-version=2019-08-01`, header `X-IDENTITY-HEADER`, `{ value, expiresAt }` cache
  KEYED BY AUDIENCE, uniform 60 s expiry skew). Per-site differences are explicit options:
  `signal`, `localTokenEnv`, `devTokenFallback` (`{ enabledEnv, resource, ttlMs }`, dev TTL 50 min),
  `fallbackTtlMs` (MI no-`expires_on` TTL, 55 min). On a non-2xx mint it throws
  `ManagedIdentityTokenError` carrying the HTTP `status` (+ `audience`, `code`) so audience
  wrappers can classify transient vs terminal (A1). The `@azure/identity` SDK swap is explicitly
  DEFERRED (code comment + README) — kept the raw mechanism to stay behaviour-preserving.
- `packages/server-runtime/src/index.test.ts` — cache-boundary unit tests (8): cache hit,
  near-expiry refresh, fallback-TTL path, dev-token path, `localTokenEnv` returned before any MI
  call (A2), and HTTP-status surfaced on failure (A1).
- `packages/server-runtime/README.md` — documented the public contract + the deferred SDK swap.

### Six bearer sites migrated (local mint deleted, delegates to the primitive)
- `services/orchestration/src/adapters/data-api-http.ts` (`getDataApiToken` removed) — `localTokenEnv: 'DATA_API_TOKEN'`.
- `services/orchestration/src/adapters/provider-archive-api.ts` (`serviceToken` removed) — `localTokenEnv`.
- `services/orchestration/src/adapters/archive-mirror-api.ts` (`serviceToken` removed) — `localTokenEnv`.
- `services/orchestration/src/adapters/box-maintenance-api.ts` (`serviceToken(signal?)` removed) — `localTokenEnv` + `signal` (AbortSignal preserved).
- `services/orchestration/src/adapters/aoai.ts` (`mintCognitiveToken` body removed) — cognitive audience + `devTokenFallback`; corrected the stale `lib/data-api.ts` comments to `adapters/data-api-http.ts` / the shared primitive.
- `services/data-api/src/features/assistant/chat-client.ts` (`mintCognitiveToken` body removed) — cognitive audience + `devTokenFallback`. Exported `mintCognitiveToken`/`resourceFromScope` kept (external callers) as thin delegators.

### Wiring
- `@cs/server-runtime` added to both services' `package.json` deps, `tsconfig.json` references,
  and `vitest.config.ts` aliases (resolve to `packages/server-runtime/src`).

## Out of scope (untouched)
`graph.ts` (client-credentials, A3); the three storage-audience sites (`platform/blob.ts`,
`evidence/blob-store.ts`, `inbound/outlook-queue.ts` — TKT-250). No CarClaims. No live/cloud writes.

## Net LOC delta (A5)
Mechanism (six sites + primitive): **net −14**. Code-extension source excl. the new test: **net −8**.
All files incl. the required first-time unit test + docs: +162 (the package's one-time fixed cost
PLAN-007 amortises across the plan). See `verification.md`.
