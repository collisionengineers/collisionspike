# Distillation note — TKT-249

**Source:** `01-server-runtime-foundation.md` findings B (request wrapper) and F (retry). **Plan:** PLAN-007.
Re-verified read-only 2026-07-19; this note is the committed verification record.

**Four request wrappers (no shared core):**
1. `services/orchestration/src/adapters/data-api-http.ts` `request()` — richest: typed 409
   (`ConflictError` / evidence-backfill variants), `DataApiHttpError`, 204 handling. Treat as the superset.
2. `services/orchestration/src/adapters/provider-archive-api.ts` `request()` — bare (generic `Error`).
3. `services/orchestration/src/adapters/archive-mirror-api.ts` `request()` — byte-identical to #2.
4. `services/orchestration/src/adapters/box-maintenance-api.ts` `post()` — POST-only, own `AbortController`
   60 s timeout.

**Error contract to preserve per wrapper (finding B):** wrapper #1 (`data-api-http.ts`) maps 409 to typed
`ConflictError` / `EvidenceBackfill*` errors; wrappers #2/#3 throw a plain `Error` on **every** non-2xx,
including 409 (`archive-mirror-api.ts:53-56`), and `internalArchiveMirrorOutboxComplete` can genuinely 409.
Routing the bare wrappers through the richest core would silently upgrade their 409 to `ConflictError` — so
the shared core stays error-neutral or maps errors per adapter; the typed semantics are not forced onto the
bare wrappers.

**Retry today (no shared primitive):** Durable `df.RetryOptions` with divergent tunings (5000/3, 10000/4,
15000/4, 30000/4); bespoke `isRetryable*` predicates (`outlook-move`, `vehicle-data-intake`,
`evidence-backfill` x3); inline one-shot retry in `chat-client.ts:207-221` (`runChat` executor) that retries
**any** thrown tool error exactly once — deliberately covering a Postgres cold-connect timeout inside the pool
window, where the error carries no HTTP status. The HTTP-status/`Retry-After` primitive must not replace this
classifier blindly: expose a caller-supplied `shouldRetry` predicate and let `chat-client.ts` pass a
tool-specific "retry once on any error" predicate. `graph.ts` loops are pagination guards (`MAX_*_PAGES`,
cycle detection), **not** retry — the draft's `graph.ts` retry example is dropped per Gate 0.

**Microsoft Learn (retry primitive design):** retryable = 408/429/500/502/503/504; honour `Retry-After`
(429/503) over computed backoff; exponential backoff **with jitter**; finite count; do not stack retry layers
over SDK clients that already retry; never retry non-transient 4xx (400/401/403).

**Out of scope here:** the narrow outbox drain tails on the adapters move in a later plan in this series
(reserved as PLAN-008, not yet authored).
