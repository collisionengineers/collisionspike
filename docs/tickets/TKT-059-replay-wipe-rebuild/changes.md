# TKT-059 — change log

Change-by-change audit trail for the replay wipe & rebuild. Newest first.

## 2026-07-04 — ticket authored

Authored during the go-live sprint (P0). Pre-wipe baseline captured under `SET ROLE csadmin`
(RLS-safe): `case_` 164, `inbound_email` 389, `work_provider` 390, `inspection_address` 2210,
`evidence` 3003, `audit_event` 2095. No code yet — build begins at P1 (`listMessagesSince`
pager + `POST /api/replay-backfill` driver).
