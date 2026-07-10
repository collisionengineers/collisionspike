# Operator note — Completed/Archive view + search (Phase D)

Placement of completed cases = a separate **"Completed/Archive" area + global search**, **not** a 4th
work-queue. The three work-queues stay work-only; this **amends** ADR-0008 rather than overturning it.

Search-scope decision to bake in: the case search must **not** exclude terminals — include
`eva_submitted` + `done` + `box_synced`; **exclude `removed`** by default (PII anonymised on soft-remove),
with a status badge on result rows. This makes global search the primary way (besides the Completed view)
to reach a delivered case.

> This is Phase D of the case-done plan. The full A–E plan (with code references) is preserved in the
> anchor ticket [TKT-094/evidence/PLAN-case-done-lifecycle.md](../../../verify/TKT-094-case-done-status-model/evidence/PLAN-case-done-lifecycle.md).
