# Distillation note — TKT-249

**Source:** `01-server-runtime-foundation.md` findings B (request wrapper) and F (retry). **Plan:** PLAN-007.
Re-verified read-only 2026-07-19 (`PLAN-007.dossier.json`).

**Four request wrappers (no shared core):**
1. `services/orchestration/src/adapters/data-api-http.ts` `request()` — richest: typed 409
   (`ConflictError` / evidence-backfill variants), `DataApiHttpError`, 204 handling. Treat as the superset.
2. `services/orchestration/src/adapters/provider-archive-api.ts` `request()` — bare (generic `Error`).
3. `services/orchestration/src/adapters/archive-mirror-api.ts` `request()` — byte-identical to #2.
4. `services/orchestration/src/adapters/box-maintenance-api.ts` `post()` — POST-only, own `AbortController`
   60 s timeout.

**Retry today (no shared primitive):** Durable `df.RetryOptions` with divergent tunings (5000/3, 10000/4,
15000/4, 30000/4); bespoke `isRetryable*` predicates (`outlook-move`, `vehicle-data-intake`,
`evidence-backfill` x3); inline one-shot retry in `chat-client.ts` (`runChat` executor). `graph.ts` loops are
pagination guards (`MAX_*_PAGES`, cycle detection), **not** retry — the draft's `graph.ts` retry example is
dropped per Gate 0.

**Microsoft Learn (retry primitive design):** retryable = 408/429/500/502/503/504; honour `Retry-After`
(429/503) over computed backoff; exponential backoff **with jitter**; finite count; do not stack retry layers
over SDK clients that already retry; never retry non-transient 4xx (400/401/403).

**Out of scope here:** the narrow outbox drain tails on the adapters move in PLAN-008.
