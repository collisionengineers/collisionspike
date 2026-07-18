# TKT-227 — distilled audit findings (2026-07-16 post-sweep three-agent audit)

Distilled from the post-sweep remediation audit of PR #102
(`feat/tkt-219-retro-parallel-reconstruction`, HEAD `e7fe2371` at audit time). This is a
**pre-existing production bug**, not a retro regression — it rides this PR's deploy train
because the operator wants the fix deployed on the open train.

## Failure signature

- Recurs at ~03:00Z nightly (the `box-blob-purge-timer` schedule `0 0 3 * * *`).
- Every `boxPurgeOne` item fails with Postgres **"remaining connection slots are
  reserved"**; the run completes with zero rows purged, so the candidate backlog grows
  night over night (~440 candidates observed at audit time, ceiling `LIMIT 1000`).

## Root-cause chain (all file/line facts re-verified against the working tree 2026-07-17)

1. `services/orchestration/src/workflows/archive/box-blob-purge.ts` (pre-fix lines 34-39):
   `boxBlobPurgeOrchestrator` mapped ALL candidates into activities and awaited one
   `ctx.df.Task.all(tasks)` — an unbounded fan-out.
2. Each `boxPurgeOne` activity calls `deleteEvidenceBytes` then `dataApi.markBlobPurged` →
   data-api `internalBoxMarkPurged`
   (`services/data-api/src/features/cases/internal-operations-routes.ts:283-302`), which opens
   a transaction and takes `lockCaseForMutation` (`FOR UPDATE` on the case row).
3. ~440 concurrent activities → data-api scale-out; each instance's pg pool allows up to
   `max: 10` connections (`services/data-api/src/platform/db/client.ts`, pre-fix line 47).
   Instances × 10 exceeded the dev-tier server's `max_connections`.
4. All items fail; the old return shape `{ purged: results.length }` counted **attempts**, not
   successes, so the orchestration output looked healthy.
5. Candidate list source: `internalBoxPurgeCandidates` (same routes file, lines 259-281):
   `SELECT case_id, storage_path FROM evidence WHERE box_file_id IS NOT NULL AND storage_path
   IS NOT NULL ORDER BY created_at LIMIT 1000`.

## Remediation shape (decided in the approved plan)

- Sequential loop with per-item try/catch salvage, on the
  `services/orchestration/src/workflows/retro/retro-related-ingest.ts` "Sequential ON PURPOSE"
  precedent; honest `{purged, failed, total}` return.
- Conservative `PGPOOL_MAX` knob in the data-api pool (default 10 = no change without an
  app-setting); operator may set `PGPOOL_MAX=5` on `cespk-api-dev` after checking
  `SHOW max_connections;` headroom.
- Deliberately NO chunked-`Task.all` concurrency knob: at ≤1000 rows a sequential nightly run
  is a few minutes and keeps DB pressure at one in-flight transaction.

## Related tickets

- TKT-089, TKT-133 (archive mirror / purge lineage).
