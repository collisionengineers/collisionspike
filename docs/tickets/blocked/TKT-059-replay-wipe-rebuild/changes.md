# TKT-059 — change log

Change-by-change audit trail for the replay wipe & rebuild. Newest first.

## 2026-07-08 — retired as superseded (now → blocked)

Operator decision (ticket-orchestrate batch): **retire this ticket as superseded** and **skip** the
optional full-`.eml` reprocess of the case-linked subset. The wipe-&-rebuild path is abandoned
(mailboxes retain only ~88/390; the deployed classifier is proven sound — see verification.md). No code
change in this pass. Moved `now → blocked` pending the dead-driver removal in
[TKT-106](../../now/TKT-106-remove-replay-backfill/TKT-106-remove-replay-backfill.md); the P1 driver
stays shipped dark (`REPLAY_BACKFILL_ENABLED=false`) until then. Findings preserved.

## 2026-07-04 — ticket authored

Authored during the go-live sprint (P0). Pre-wipe baseline captured under `SET ROLE csadmin`
(RLS-safe): `case_` 164, `inbound_email` 389, `work_provider` 390, `inspection_address` 2210,
`evidence` 3003, `audit_event` 2095. No code yet — build begins at P1 (`listMessagesSince`
pager + `POST /api/replay-backfill` driver).
