# Changes — TKT-087: Box report 409 upload conflicts - investigate duplicate archive attempts

## Status
not started (rescoped — see below)

## Reconciliation note (2026-07-07) — stays backlog, rescoped to investigation-only
The idempotent-409 behaviour this ticket contemplates **already exists server-side**: the Box archive path
treats a 409 name-conflict as an idempotent reuse — `orchestration/src/functions/activities/boxArchive.ts:19`
("Idempotent: a Box 409 name-conflict is …") and `orchestration/src/lib/functions-client.ts:280`
("409 name-conflict is an idempotent reuse server-side, so a replayed archive …"). So there is **no fix to
build**; the outstanding work is purely the **forensic verdict** on the 18×409 in the operator's Box report
(2026-07-03): confirm they are benign replay/idempotency vs a double-processing vector, correlating with
**TKT-092** (PCH duplicate cases). Rescope to investigation-only.
