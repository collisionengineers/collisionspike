# Changes — TKT-227: Nightly box-purge fan-out exhausts Postgres connections; nothing purges

## Status

now — code + offline tests complete on `feat/tkt-219-retro-parallel-reconstruction`; rides
PR #102's deploy train (orchestration must land before the next 03:00Z timer).

## Commits

- (pending) — committed by the dispatching session together with the rest of the post-sweep
  remediation batch; this ticket's diff is the three files below.

## Files touched

- `services/orchestration/src/workflows/archive/box-blob-purge.ts` — orchestrator body
  rewritten from unbounded `Task.all` fan-out to a sequential loop with per-item try/catch
  salvage (typed `Generator<Task, unknown, never>`, `import type { Task }`); honest
  `{purged, failed, total}` return; explanatory comment carries the root cause. Timer starter
  and both activities (gates included) unchanged.
- `services/orchestration/src/workflows/archive/box-blob-purge.test.ts` (NEW) — generator-walk
  tests (retro-related-ingest.test.ts pattern).
- `services/data-api/src/platform/db/client.ts` — `max: 10` → `max: poolMax()`; new exported
  `poolMax()` reads `PGPOOL_MAX`, clamps `1..20`, defaults `10` (no behaviour change without an
  app-setting). Admin-pool guidance in the header untouched.
- `services/data-api/src/platform/db/client.test.ts` (NEW) — `poolMax()` clamp/default unit
  tests.

## Summary

The nightly 03:00Z purge scheduled every candidate concurrently; each item's
`internalBoxMarkPurged` opens a transaction with a `FOR UPDATE` case lock, so ~440 concurrent
activities exhausted dev-tier `max_connections` and every item failed ("remaining connection
slots are reserved") — nothing purged, backlog compounding nightly. The orchestrator now purges
sequentially (one in-flight DB transaction) and salvages per-item failures; the old return
counted attempts, the new one counts successes. `PGPOOL_MAX` gives the operator a conservative
per-instance pool cap for defence in depth. Pre-existing production bug riding PR #102's train —
not a retro regression.
