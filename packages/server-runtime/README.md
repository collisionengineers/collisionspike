# Server-runtime package

`@cs/server-runtime` owns **server-only** shared runtime plumbing. It is the deliberate
complement to `@cs/domain`: where `@cs/domain` is browser-safe and must not depend on a runtime
adapter, database client, or cloud SDK, `@cs/server-runtime` **is** allowed to import cloud SDKs and
depend on the Node runtime. The two must never be merged — pulling this package into the SPA bundle
would poison it with cloud SDKs and Node-only code.

## Ownership

Platform. This package is the single home for runtime plumbing that both TypeScript services would
otherwise re-implement (managed-identity token minting, the Data-API HTTP core, bounded retry, the
storage-token helper).

## Public contract

Public exports live in `src/index.ts`.

- `getManagedIdentityToken(audience, options)` — **TKT-248 / PLAN-007.** The single
  App Service managed-identity token mint, consolidating the six previously hand-rolled bearer-token
  mints across both TypeScript services. It keeps the **exact** raw `IDENTITY_ENDPOINT` REST
  mechanism (`api-version=2019-08-01`, header `X-IDENTITY-HEADER`, `{ value, expiresAt }` cache keyed
  by audience, uniform 60-second expiry skew). The genuine per-site differences are explicit options:
  `signal` (box-maintenance's abort), `localTokenEnv` (the four Data-API adapters' `DATA_API_TOKEN`
  off-Azure override, returned verbatim before any mint), `devTokenFallback` (the two cognitive mints'
  explicit-opt-in az-CLI dev token, with its own 50-minute cache TTL), and `fallbackTtlMs` (the
  55-minute token-absent MI fallback TTL). On a non-2xx mint it throws `ManagedIdentityTokenError`
  carrying the HTTP `status` so audience wrappers (e.g. TKT-250's storage wrapper) can tell a
  transient throttle/outage from a terminal configuration fault.
- `ManagedIdentityTokenError` — the mint-failure error (carries `status`, `audience`, `code`).
- `request(options)` / `post(path, options)` — **TKT-249 / PLAN-007.** The single Data-API HTTP
  transport core the four adapters (`data-api-http.ts`, `provider-archive-api.ts`,
  `archive-mirror-api.ts`, `box-maintenance-api.ts`) route through. It owns only the shared plumbing —
  the `DATA_API_URL` base (trailing slash stripped, absent → `missing DATA_API_URL`), the
  `DATA_API_AUDIENCE` managed-identity bearer with the `DATA_API_TOKEN` off-Azure override, the JSON
  headers, and an optional AbortController `timeoutMs` (box-maintenance's wake-safe 60s). It is
  **error-neutral**: every non-2xx is handed to the caller's `mapError`, so each adapter keeps its
  EXACT observable error contract — `data-api-http.ts` its typed 409 / `DataApiHttpError`, the two bare
  archive adapters (and box) a plain `Error`. `emptyOn204` returns `undefined` for a 204.
  `DataApiRequestOptions` / `DataApiErrorMapper` are the types.
- `withRetry(fn, options)` — **TKT-249 / PLAN-007.** One bounded-retry primitive following the
  Microsoft Learn transient-fault guidance: an explicit retryable status set (`RETRYABLE_HTTP_STATUS` =
  408/429/500/502/503/504), a server `Retry-After` honoured on 429/503 (`RETRY_AFTER_STATUS`) over the
  computed backoff, exponential backoff **with jitter**, and a FINITE `maxAttempts` cap. HTTP callers
  get the status classifier for free; non-HTTP callers pass a `shouldRetry` predicate (the assistant
  tool loop's "retry any tool error once", covering a Postgres cold-connect timeout that carries no HTTP
  status). `maxAttempts: 1` adds zero retry layers, so it composes safely OVER an SDK client that
  already retries (no double-retry). `RetryOptions` is the type.

**Deferred follow-up (not implemented here):** PLAN-007 notes a preference for wrapping the
`@azure/identity` `ManagedIdentityCredential` (a single reused credential; SDK-managed caching/refresh;
avoids Entra-side HTTP 429s) instead of the raw endpoint. TKT-248 deliberately keeps the raw mechanism:
swapping it would change the mint behaviour and add a dependency, breaking the behaviour-preserving
consolidation. Track the SDK swap as its own ticket.

TKT-249 (HTTP core + bounded retry) landed the `request`/`post` and `withRetry` exports above;
TKT-250 (storage-audience wrapper) adds the remaining export.

## Callers

The server-side TypeScript services only — `@cs/api` (data-api) and `@cs/orchestration`. The web app
(`@cs/web`) must never reach it — that boundary is asserted by
[`check:production-dependencies`](../../scripts/checks/check-production-dependencies.mjs), which fails
if any browser production graph reaches this package.

Current `getManagedIdentityToken` call sites: the Data-API HTTP core (`src/data-api-http-core.ts`, the
single mint for all four Data-API adapters after TKT-249), `adapters/aoai.ts` (orchestration) and
`features/assistant/chat-client.ts` (data-api). The four Data-API adapters now reach the mint indirectly
through the core's `request`/`post`. `withRetry` callers: `features/assistant/chat-client.ts` (data-api).

## Tests

`npm run test --workspace @cs/server-runtime` (Vitest). Build in isolation with
`npm run build --workspace @cs/server-runtime`.

## Deployment

`@cs/server-runtime` is **not deployed on its own** and produces no standalone artifact. It is a
workspace dependency of `@cs/api` (data-api) and `@cs/orchestration`, and is compiled **into each of
those two services' Azure Function App bundles** by the repository packaging build: `npm run bundle`
runs the per-service esbuild bundlers, which inline this package into each service, and
`npm run package:deploy` (`npm run bundle` + `scripts/build/install-function-dependencies.cjs`)
assembles the two deployable Function artifacts. The `npm run build --workspace @cs/server-runtime`
`dist/` output exists only for isolated type-checking and tests — do not publish or deploy this package
independently.

## Configuration

`getManagedIdentityToken` reads the App Service managed-identity environment the platform injects:
`IDENTITY_ENDPOINT` and `IDENTITY_HEADER`. Per-audience inputs are passed by callers, not read here:
the Data-API audience (`DATA_API_AUDIENCE`) and its `DATA_API_TOKEN` off-Azure override are supplied by
the four Data-API adapters via the `localTokenEnv` option; the cognitive mints supply the Cognitive
Services resource and gate their az-CLI dev fallback on `AOAI_DEV_TOKEN=1`.

The Data-API HTTP core reads `DATA_API_URL` (the base) and mints its bearer for `DATA_API_AUDIENCE` with
the `DATA_API_TOKEN` override — the same environment the four adapters used before consolidation; routes,
payloads, and auth are unchanged. `withRetry` reads no environment: its policy is passed per call.
The storage mechanism (TKT-250) documents its inputs here when it lands.

Decision of record: [ADR-0031](../../docs/adr/0031-server-runtime-boundary.md).
