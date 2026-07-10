---
id: TKT-059
title: "Replay: wipe & rebuild derived data from full mailbox history"
status: done
priority: P1
area: intake
tickets-it-relates-to: [TKT-058, TKT-027, TKT-012, TKT-026]
research-link: docs/plans/go-live/README.md
---

# Replay: wipe & rebuild derived data from full mailbox history

## Problem

The live stack has been intaking on info@ + engineers@ + desk@ since ~2026-06-30, but the derived
data it built up (~165 `case_` rows / ~355 `inbound_email` rows) was processed by **since-fixed
code** — the misclassification fixes, taxonomy-v2, and provider-corpus corrections all landed
*after* those emails were ingested. The UI therefore shows stale classifications, wrong providers,
and un-linked follow-ups that current logic would get right. Incremental re-processing is unsafe:
the live intake queue no-ops on replay (`intake-starter.ts` derives `instanceId = intake-<safeMessageId>`
and skips any existing non-`Failed`/non-`Terminated` instance — including **Completed** ones — and the
Durable task hub survives a DB wipe), so there is no way to re-drive history through the fixed pipeline
without a deliberate rebuild.

The operator-approved decision (GO_LIVE_SPRINT_PLAN.md §Context, binding) is **WIPE & REBUILD**:
clear derived data and re-ingest the full mailbox history from Graph (read-only — the grant is
`Mail.Read`, mailboxes physically cannot be mutated) through the live pipeline at production gate
settings, so the rebuilt state is exactly what live *would* have produced. Accepted loss: staff
triage states/stamps since go-live, mitigated by a pre-wipe export + re-stamp.

## Change

Phases **P1 / P3 / P3V** of GO_LIVE_SPRINT_PLAN.md. Build once (rehearsed read-only in P1), execute
once (P3), verify once (P3V):

- **Extended pager** — `orchestration/src/lib/graph.ts` gains `listMessagesSince(mailbox, sinceIso, untilIso, pageUrl?)`:
  `$filter` receivedDateTime range, `$orderby` asc, `@odata.nextLink` loop, scoped to **Inbox +
  descendants** (client-filter by `parentFolderId`, excluding Sent/Deleted/Junk/Drafts) so
  staff-filed mail — moved out of Inbox since `OUTLOOK_MOVE_ENABLED=true` — is not missed. Leave the
  existing `listMessageIdsSince` (graph.ts:277) untouched.
- **Replay driver** — a keyed `POST /api/replay-backfill` starter cloning the `gated/retro-case.ts`
  pattern (function authLevel, deterministic driver id, `getStatus` dedup) plus a driver
  orchestrator: chronological **3-way mailbox merge**, `intakeOrchestrator` started as a
  **sub-orchestrator under a fresh namespace `replay-r1-<safeId>`** (never re-enqueuing
  `intake-messages`, so the Completed-instance skip above cannot swallow the replay), per-child
  try/catch (the un-wrapped `enrich` tail must not fail the run — record and continue),
  `continueAsNew` batching + `setCustomStatus` progress, and a **dry-run** mode (Graph metadata +
  parser classify only, zero DB writes) that emits a per-message manifest NDJSON as P3's ground truth.
- **Wipe delta** — a new idempotent, single-transaction `migration/assets/schema/deltas/` file:
  seeds `case_po_floor` (table already live, `deltas/2026-07-04-case-po-floor.sql`) from **pre-wipe
  `case_` maxima** per marker prefix so folder-name reuse is impossible by construction (Box
  `create_folder` silently *adopts* an existing folder on `item_name_in_use`), writes a `replay_epoch`
  audit marker with pre-counts, then `DELETE` (never `TRUNCATE ... CASCADE`, which would follow FKs
  into `audit_event`) from `ai_suggestion`, `inbound_email`, `case_`. **Kept:** the reference corpus,
  junction tables, `provider_api_key`, `case_po_floor`, `app_setting`, `choice_*`, `improvement_signal`,
  and append-only `audit_event` (its `case_id` FKs SET-NULL by design). `internal.ts:1103`
  `ON CONFLICT (source_message_id)` (= `internetMessageId`, stable across moves) remains the dedup key.
- **Safety** — pre-wipe: full `pg_dump -Fc` (row counts verified against live) + human-work export
  (staff-stamped Case/POs, notes, chasers, human triage overrides) + a Box holding-folder move of the
  existing case folders. Then smoke-replay 3 messages under `replay-r1-*`, inspect, then the full
  sequential run at concurrency 1 with all production gates ON.

## Acceptance

- [ ] `listMessagesSince` pages Inbox + descendants across `@odata.nextLink` for all three mailboxes; `listMessageIdsSince` unchanged; `verify-all.mjs` stays 9/9.
- [ ] `POST /api/replay-backfill` dry-run produces a complete manifest that reconciles 100% against live mailbox counts (per-mailbox), with zero DB writes.
- [ ] Live full run drives every manifest message through `intakeOrchestrator` under the `replay-r1-<safeId>` namespace (no `intake-messages` re-enqueue); per-child failures recorded in the driver `failed[]`, none aborts the run.
- [ ] Wipe delta runs in one transaction: `case_po_floor` seeded from pre-wipe maxima; `DELETE` (not `TRUNCATE CASCADE`); `audit_event` retained with pre-epoch rows carrying `case_id IS NULL`; `improvement_signal` + reference corpus intact.
- [ ] `pg_dump` (row counts matched) and the human-work export are captured **before** the wipe; Box case folders moved to the `_pre-replay-*` holding folder.
- [ ] Manifest reconciliation gate passes: every manifest row has an `inbound_email` row (0 missing), no extra pre-T0 rows.
- [ ] Consistency gates pass: category/status distributions match manifest predictions (exact on the eval-locked subset); every case's `box_folder_id` resolves and **none point under `_pre-replay-*`** (no 409-adoption); zero minted POs ≤ floor; queue counts == queue-list lengths (TKT-012/TKT-026).
- [ ] Ticket-probe cluster closes on the replayed data: TKT-021/023/027/028/031/039/041/046/047/051/056 each land their sample on the locked category/subtype + side-effect; TKT-058 rung-1 (unmatched billing/update → link or honest failure audit) proven.
- [ ] Post-T0 un-linked update/cancel/query/billing drained via `POST /api/retro-case`; exported staff Case/POs + human triage states re-applied.

## Research

[GO_LIVE_SPRINT_PLAN.md](../../../plans/go-live/README.md) — phases P0 (preflight), P1 (pager + dry-run
driver), P3 (wipe & rebuild runbook), P3V (verification + relink); §"Critical code-verified traps".

## Artifacts

Change-by-change audit trail: [changes.md](./changes.md) · smoke/verification steps:
[verification.md](./verification.md).

## Status update — 2026-07-08 (blocked — RETIRED AS SUPERSEDED, operator decision)

**Disposition: superseded, moved to `blocked`.** The wipe-&-rebuild-from-mailbox premise is
**abandoned** — the P1 dry-run proved the live Inboxes retain only ~88 of 390 ingested emails (staff
file/delete processed mail into Deleted Items), so a wipe would have destroyed ~150 cases it could not
rebuild, and an eval proved the deployed classifier is sound (~94% `receiving_work` recall), so the
existing derived data is largely correct. See [verification.md](./verification.md) Findings 1 & 2 + the
P2 resolution, and the memory `[[replay-mailboxes-do-not-retain-history]]`.

The operator was offered the one residual candidate — an **optional** full-`.eml` reprocess of the
~212 case-linked emails (safe but low-value) — and **declined it** (ticket-orchestrate batch,
2026-07-08). Nothing in this ticket's Acceptance is needed for go-live.

**The Acceptance section above is therefore moot** (it describes the abandoned wipe path) and is not
being pursued. The P1 driver (`listMessagesSince` pager + keyed `POST /api/replay-backfill` +
`replay-manifest.ts`) remains **built, deployed, and shipped dark** (`REPLAY_BACKFILL_ENABLED=false`);
its **removal is tracked by [TKT-106](../TKT-106-remove-replay-backfill/TKT-106-remove-replay-backfill.md)**.
This ticket is `blocked` pending that removal — once TKT-106 lands, close both. The non-viability
**finding is preserved** here and in TKT-106 (do not lose it with the code).
