---
id: TKT-010
title: Delete/remove case with confirm + optional Box-folder removal
status: now
priority: P2
area: ui
tickets-it-relates-to: [TKT-003]
research-link: docs/plans/work-todo-spike/ui-changes/research/delete-case.md
---

# Delete/remove case with confirm + optional Box-folder removal

## Problem
Add an option to **delete/remove** a case. A confirmation window appears with a **tickbox to also remove
the associated Box folder**.

## Evidence
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
- Operator stub: [delete-case.md](../plans/work-todo-spike/ui-changes/delete-case.md)
- Research pack: [research/delete-case.md](../plans/work-todo-spike/ui-changes/research/delete-case.md)
