---
id: TKT-230
title: Retro post-sweep batch — stale stamps, multi-mailbox trigger, rung-1 writable mirror, receiving_work surfacing
status: now
priority: P2
area: email
tickets-it-relates-to: [TKT-219, TKT-220, TKT-222, TKT-223, TKT-225, TKT-119, TKT-140, TKT-194]
research-link: docs/tickets/now/TKT-230-retro-post-sweep-remediation/evidence/post-sweep-audit-2026-07-16.md
---

# Retro post-sweep batch — stale stamps, multi-mailbox trigger, rung-1 writable mirror, receiving_work surfacing

## Problem

Four retro-pipeline gaps found by the 2026-07-16 post-sweep three-agent audit of PR #102
(distilled in [evidence/post-sweep-audit-2026-07-16.md](./evidence/post-sweep-audit-2026-07-16.md)):

**Item 4 — stale `unable_to_locate` stamps (12 live rows).** `retroRecordFailure` stamps via
`internalInboundAttention`; a later retro link flows through `upsertInboundEmail`, whose
ON CONFLICT fills `case_id` but never clears the stamp. Linked rows keep rendering the
"Unable to locate" chip — a standing contradiction.

**Item 5 — 61 terminal `trigger_not_found` drain rows.** `retroFindTrigger` probed only the
stored `source_mailbox`; a message filed/moved into another intake mailbox (cross-mailbox
twins) was unreachable, stranding the drain row terminally.

**Item 6 — rung-1 linked lane never mirrors fresh evidence.** The rung-1 record-keeping chain
(TKT-220 G7) deliberately omitted `boxArchiveEvidence` because a retro-linked case's folder
MAY sit under the read-only archive roots — but many rung-1 cases (e.g. SWAN26007) have
folders created by live intake under the WRITABLE pinned root; their fresh evidence never
mirrored ("Not archived" persists).

**Item 7 — 21 re-labelled receiving_work instructions invisible.** Rows carrying an
instruction label sit with `case_id NULL`, no chip, no suggestion, no audit stamp.
**Reconciliation (recorded per the plan):** the cluster-analysis claim "the not_eligible early
return discards the live re-classification" is WRONG on the persistence axis — on the drain
path `classifyInbound` runs BEFORE `decideRetro` and persists the classification itself
(`classifyInbound` → `dataApi.recordInboundEmail`); that is why stored receiving_work labels
grew 4→20. The early return discards only the retro *decision*. There is no persistence gap on
any current path; the real defect is **visibility**.

Deploy-train note: this ticket rides PR #102's open deploy train together with TKT-227/228
(pre-existing production P1s unrelated to the retro work — on the train because the operator
wants remediation deployed, not because they are retro regressions) and TKT-229/231.

## Change

**Item 4** — `persistence.ts`: exported pinned `INBOUND_ATTENTION_CLEAR_ON_LINK_SQL` CASE
fragment (clear exactly on the unlinked→linked transition, preserve otherwise) added to the
ON CONFLICT SET — **schema-tolerant**: emitted only when `tableColumns('inbound_email')`
reports `attention_reason`, since the column is not in the INSERT list and an older DB would
500 the whole upsert. The TKT-226 pair-refresh CASE and human-mode freeze are untouched.
Hardening (included per plan): `internalInboundAttention` adds `AND case_id IS NULL` to its
UPDATE for `reason='unable_to_locate'` only — a late failure stamp can no longer land on a row
a parallel path just linked. One-time cleanup of the 12 live rows: section 1 of
`database/operations/tkt230-clear-stale-unable-to-locate.sql` (documented operator SQL with
pre/post checks — NOT a migration, NOT executed by this ticket's implementation).

**Item 5** — `retroFindTrigger` (retro-activities.ts) probes the stored mailbox FIRST, then
every other configured intake mailbox (`intakeMailboxes()`), per-mailbox try/catch salvage
(the retroOutlookLocate idiom). Bounded (3 mailboxes × 1 `$filter`), read-only, same Mail.Read
scope; the additive `mailbox` return field is informational (downstream `fetchMessage`
consumes `resource`). No orchestrator change. Follow-up instrument: `retro-deleted-probe`
would split residual not-found rows into deleted vs recoverable; the TKT-223 `force=true`
lever is the re-drive mechanism for the 61 rows after deploy.

**Item 6** — new checkpointed activity `retroCaseFolderWritable` (gates read INSIDE the
activity: retroCase + the boxArchiveEvidence gate pair boxApi/boxFolderAtIntake): resolves the
case folder via `dataApi.getCaseBoxFolder`, and when RETRO_BOX_ARCHIVE_ROOT_IDS is configured
checks the folder id + `path_collection` ancestors from the facade `box.getFolder` against the
RO roots; fail-closed (`folder_unreadable`) on any read failure. The rung-1 branch of
`retroCaseOrchestrator`, inside the existing best-effort try after `statusEvaluate`, branches
only on the checkpointed probe result and calls `boxArchiveEvidence` (idempotent) on
`writable: true`. The old "boxArchiveEvidence stays deliberately absent" comment now documents
the D8-extended-to-rung-1 doctrine.

**Item 7** — both eligibility early-returns (`!decision.attempt` on the drain path;
`no_usable_key`) now record the failure via the existing best-effort `retroRecordFailure`
pattern **only when the persisted classification is `receiving_work`** — giving the row the
existing attention chip (`!row.caseId && row.attentionReason`). Never auto-mint; the stamp can
never alter the returned outcome. No schema change → no collision with TKT-194; a more precise
reason value should ride TKT-194's reason-code widening (relates-to linked both ways).
One-time surfacing of the EXISTING 21 rows: section 2 of the same operational SQL (pre-check,
stamp, post-check; the receiving_work code resolved from the choice table, never hardcoded).
Alternative considered: force re-drive of the 21 rows — the SQL is recommended (faster, no
Graph dependency, and the new guard stamps the same reason anyway).

## Acceptance

1. A stamped row that later links has its `unable_to_locate` cleared by the upsert; the ops
   SQL zeroes the existing 12; the count stays 0 after the next retro wave.
2. A drain trigger present only in a non-stored intake mailbox is found (found-rate delta on a
   force-relaunched sample of the 61 rows; residue → retro-deleted-probe follow-up).
3. The next rung-1 link on a writable-folder case mirrors evidence (gains `box_file_id`; SPA
   "Not archived" gone; SWAN26007 re-checked); a case under the RO roots is untouched.
4. The 21 receiving_work rows show the chip after the ops SQL; a NEW not-eligible
   receiving_work drain gets the chip from the orchestrator guard.
5. Durable rules hold: gates inside activities, orchestrator branches only on checkpointed
   results, no new step can unwind a linked case.

## Follow-ups (P4 — record only)

- (a) case `afa8120a` stuck at staff-visible `error` status after the
  identity-unverified-hold recompute.
- (b) stale `on_hold_reason='provider_unresolved'` after provider resolution.
- (c) `retro_case_created` audit replays (44 audits / 39 rows — at-least-once semantics);
  candidate for onceKey-style dedup after TKT-229 proves the pattern.

## Artifacts

- [Changes made](./changes.md)
- [Verification record](./verification.md)
