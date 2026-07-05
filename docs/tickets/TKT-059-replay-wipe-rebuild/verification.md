# TKT-059 — verification

Smoke + verification steps for the replay wipe & rebuild. Fill in as phases complete.

## Pre-wipe baseline (P0 — captured 2026-07-04)

Connected `SET ROLE csadmin` (RLS bypass — non-admin reads return false zeros, see the runbook):

| table | rows |
|---|---|
| case_ | 164 |
| inbound_email | 389 |
| work_provider | 390 |
| inspection_address | 2210 |
| evidence | 3003 |
| audit_event | 2095 |

## P1 — dry-run manifest (RUN 2026-07-05, epoch `dry1`) — TWO PLAN-CHANGING FINDINGS

- [x] `POST /api/replay-backfill {dryRun:true}` ran green over all three mailboxes (Inbox+descendants, nextLink paging). Driver validated end-to-end.
- **Finding 1 — mailboxes do NOT retain history (wipe-and-rebuild-from-mailbox is non-viable).**
  Dry-run collected **88** messages vs **390** `inbound_email` in the DB. Graph folder inventory: the
  three Inboxes hold only 48/47/22 now; Deleted Items hold 7,081/9,485/7,107 — staff delete/file mail
  out of the Inbox after processing. A mailbox-sourced rebuild would recover ~88/390 and destroy ~150
  cases. Operator pivoted to **in-place reprocess** (2026-07-05). See [[replay-mailboxes-do-not-retain-history]].
- **Finding 2 — a naive in-place reprocess would CORRUPT the data (do NOT auto-apply).**
  Read-only reprocess-diff (current parser `/classify-email` over the 390 stored rows): **240/390 (62%)
  change category** — but the changes mis-demote obvious NEW WORK ("NEW ENGINEER INSTRUCTION …" → other,
  "New inspection request - AX Ref…" → query, "(EREF9) RTA … Enclosing Inspection Request" → case_update).
  `receiving_work` collapses 188 → 2. Reconstructing attachment kinds from case evidence (`case_id`→
  `evidence`; note `evidence.source_message_id` is ALWAYS NULL so no per-email join) did NOT fix it
  (209/212 still change). Conclusion: the divergence is real (data is stale) but the bare classifier
  route over-corrects, so the reprocess must run through the FULL live pipeline and be validated against
  a labelled sample (the P2 fix-wave) BEFORE any write. Reprocess is BLOCKED on P2.

## P3 — wipe & rebuild
- [ ] pg_dump taken + row counts verified against live (RLS-safe).
- [ ] Box case folders moved into `_pre-replay-2026-07-XX` holding folder.
- [ ] Wipe delta applied (DELETE not TRUNCATE CASCADE; `audit_event` kept; `case_po_floor` seeded from pre-wipe maxima; epoch marker written).
- [ ] Smoke replay of 3 messages inspected before the full run.
- [ ] Full replay complete (sequential, production gate settings).

## P3V — verification
- [ ] Manifest reconciliation: every manifest row has an `inbound_email` row (0 missing).
- [ ] DB consistency vs baseline (category/status distributions, no orphan evidence, no `box_folder_id` under `_pre-replay-*`, twins flagged not duplicated, queue counts == memberships).
- [ ] Per-ticket closures asserted (TKT-021/023/027/028/031/039/041/046/047/051/056/058).
- [ ] Relink sweep + re-stamp of exported human work.
