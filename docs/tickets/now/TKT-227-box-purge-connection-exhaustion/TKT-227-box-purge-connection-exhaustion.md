---
id: TKT-227
title: Nightly box-purge fan-out exhausts Postgres connections; nothing purges
status: now
priority: P1
area: archive
tickets-it-relates-to: [TKT-089, TKT-133]
research-link: docs/tickets/now/TKT-227-box-purge-connection-exhaustion/evidence/audit-findings-2026-07-16.md
---

# Nightly box-purge fan-out exhausts Postgres connections; nothing purges

## Problem

This is a **pre-existing production bug unrelated to the retro work**: it rides PR #102's open
deploy train (`feat/tkt-219-retro-parallel-reconstruction`) because the operator wants the
remediation deployed, not because it is a retro regression. It recurs at ~03:00Z nightly.

`boxBlobPurgeOrchestrator` (`services/orchestration/src/workflows/archive/box-blob-purge.ts`)
mapped ALL purge candidates into activities and awaited one `Task.all` — an unbounded fan-out.
Each `boxPurgeOne` calls `dataApi.markBlobPurged` → data-api `internalBoxMarkPurged`
(`services/data-api/src/features/cases/internal-operations-routes.ts:283-302`), which opens a
transaction and takes `lockCaseForMutation` (`FOR UPDATE`). With ~440 candidates the concurrent
activities drove data-api scale-out, each instance's pg pool up to `max: 10`
(`services/data-api/src/platform/db/client.ts`), exhausting the dev-tier `max_connections` —
every item failed with "remaining connection slots are reserved" and **nothing was purged**. The
candidate list comes from `internalBoxPurgeCandidates` (same file, lines 259-281:
`box_file_id IS NOT NULL AND storage_path IS NOT NULL LIMIT 1000`) and has grown nightly because
the failed runs never drain it.

Distilled audit findings: [evidence/audit-findings-2026-07-16.md](./evidence/audit-findings-2026-07-16.md).

## Change

1. **Sequential purge loop with per-item salvage** — the orchestrator body is rewritten on the
   `retro-related-ingest.ts` precedent ("Sequential ON PURPOSE"): typed
   `Generator<Task, unknown, never>`, one `boxPurgeOne` in flight at a time, per-item try/catch
   so one bad item never sinks the batch, honest return `{purged, failed, total}` (the old
   `{purged: results.length}` counted attempts, not successes). Gates stay inside the activities
   (unchanged); no env/`Date.now` reads in the orchestrator body; deterministic on replay. At the
   LIMIT-1000 ceiling a sequential nightly run is a few minutes — deliberately NO chunked
   `Task.all` knob.
2. **Pool cap knob (conservative)** — `poolMax()` in `services/data-api/src/platform/db/client.ts`
   reads `PGPOOL_MAX`, clamps to `1..20`, defaults `10`. No behaviour change without an
   app-setting; the operator MAY set `PGPOOL_MAX=5` on `cespk-api-dev` after verifying headroom
   (record `SHOW max_connections;` in verification.md). The separate admin-role pool guidance in
   the client.ts header is untouched — this caps the existing staff pool only.

## Acceptance

1. The orchestrator schedules `boxPurgeOne` strictly one at a time — never an array yield or a
   `Task.all` — with per-item salvage and return shape `{purged, failed, total}` (generator-walk
   tests in `box-blob-purge.test.ts`).
2. `poolMax()` clamps garbage/absent to 10, respects `1..20` (unit tests in `client.test.ts`);
   the pool uses it.
3. Post-deploy, at the next 03:00Z run: orchestration traces show the started line, per-item
   events, and a final `{purged, failed: 0, total}`; `exceptions` with
   "remaining connection slots" count 0; data-api `internalBoxMarkPurged` returns 2xx only;
   `SELECT count(*) FROM evidence WHERE box_file_id IS NOT NULL AND storage_path IS NOT NULL;`
   is ~0 after the run.

## Research

Root cause established by the 2026-07-16 post-sweep three-agent audit of PR #102's train; the
distilled note is banked at
[evidence/audit-findings-2026-07-16.md](./evidence/audit-findings-2026-07-16.md) (App Insights
free-tier telemetry is perishable — the KQL probes in verification.md must be re-run same-day
after deploy).

## Artifacts

- [Changes made](./changes.md)
- [Verification record](./verification.md)
