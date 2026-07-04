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

## P1 — dry-run manifest
- [ ] `POST /api/replay-backfill {dryRun:true}` walks all three mailboxes (Inbox + descendants) via `listMessagesSince` nextLink paging.
- [ ] Manifest NDJSON reconciles with mailbox counts (per-mailbox totals match Graph).

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
