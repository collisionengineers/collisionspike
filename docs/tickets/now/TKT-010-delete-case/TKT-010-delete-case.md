---
id: TKT-010
title: Close case (renamed from delete/remove) — confirm + audit, available to all users
status: now
priority: P2
area: ui
tickets-it-relates-to: [TKT-003]
research-link: docs/plans/work-todo-spike/ui-changes/research/delete-case.md
plan: PLAN-003
---

# Close case (renamed from delete/remove) — confirm + audit, available to all users

> **Re-scoped 2026-07-08 (operator, workstream item 13).** The action is a **Close case** (terminal soft state),
> not a delete; the **Superuser gate is dropped** — available to all staff users. Box-folder removal stays
> ACK-only per ADR-0017 (no automated Box deletion). The built soft-remove/confirm/audit plumbing is reused;
> rename the SPA control + dialog copy and relax the API role guard to CollisionSpike.User.

## Problem
Add an option to **delete/remove** a case. A confirmation window appears with a **tickbox to also remove
the associated Box folder**.

## Evidence
- [evidence/operator-note-2026-07-08.md](./evidence/operator-note-2026-07-08.md) — 2026-07-08 operator direction (workstream item 13): rename to **Close case**, available to **all** users — dissolves the Superuser-assignment block.

Note the standing principle: there is **no automated deletion from Box** in the pipeline — this is an
explicit, operator-confirmed manual action, distinct from any retention/purge job. Postgres is the
system of record; deletion must respect the append-only audit trail. See the research pack.

## Proposed change
Add a delete-case action with a confirm dialog; the optional checkbox additionally removes the Box
folder. Record the deletion in the audit trail.

## Acceptance
Deleting a case requires explicit confirmation; ticking the box also removes the Box folder; the action
is audited; nothing is deleted from Box without the explicit tick.

## Research
- Operator stub: [delete-case.md](../../../plans/work-todo-spike/ui-changes/delete-case.md)
- Research pack: [research/delete-case.md](../../../plans/work-todo-spike/ui-changes/research/delete-case.md)

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
