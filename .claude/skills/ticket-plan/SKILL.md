---
name: ticket-plan
description: Creates and maintains docs/tickets/plans/PLAN-NNN plans that cluster related collisionspike tickets. Use for multi-ticket operator plans, plan lifecycle updates, bidirectional plan/ticket links, and closing plans when all member tickets are done.
disable-model-invocation: true
---

# Ticket plan

Workflow for creating or maintaining a ticket plan under `docs/tickets/plans/`. A plan clusters related
TKT tickets but never moves with ticket status changes.

## Quick checklist

```
- [ ] Confirm the material is multi-ticket, not one atomic ticket
- [ ] Allocate PLAN-NNN by scanning docs/tickets/plans/PLAN-*.md
- [ ] Create/update PLAN-NNN-<slug>.md from templates.md
- [ ] Ensure every listed TKT exists (or create tickets with ticket-distill)
- [ ] Add plan: PLAN-NNN to every member ticket
- [ ] Ensure the plan's tickets list includes every member ticket that points back
- [ ] Link the plan from docs/tickets/README.md / BOARD.md as needed
- [ ] node scripts/check-tickets.mjs && node scripts/check-doc-links.mjs
```

## When to use a plan

Use a plan when the operator gives a programme of work that naturally decomposes into several tickets, or when
multiple existing tickets share an execution sequence/dependency graph. Do **not** use a plan for one atomic bug;
create a normal ticket instead.

## Plan format

Plans live at `docs/tickets/plans/PLAN-NNN-<slug>.md` and begin with:

```yaml
---
id: PLAN-NNN
title: Short programme title
status: active      # active | done | superseded
tickets: [TKT-001, TKT-002]
depends-on: [PLAN-001]  # optional
---
```

Body guidance:
- Context / source material
- Decisions already made
- Ticket sequence and dependencies
- What is deliberately deferred
- Verification or close-out standard for the plan as a whole

## Id allocation

Scan all existing `docs/tickets/plans/PLAN-*.md`; allocate `max(NNN)+1`. Never reuse an id.

## Bidirectional linking

- Every plan `tickets:` entry must resolve to an existing ticket.
- Every member ticket should carry `plan: PLAN-NNN` frontmatter.
- If a ticket has `plan: PLAN-NNN`, the plan should list it in `tickets:`. `check-tickets` warns when this drifts.

## Lifecycle

| Status | Meaning |
|--------|---------|
| `active` | Some member tickets are open, queued, verifying, or blocked |
| `done` | All member tickets are done and the plan close-out notes are recorded |
| `superseded` | Replaced by another plan or decision; link the successor |

Close a plan only after all member tickets are `done` or explicitly transferred/superseded.

## Finish

```bash
node scripts/check-tickets.mjs
node scripts/check-doc-links.mjs
```

## Additional resources

- Templates: [templates.md](templates.md)
- Ticket system spec: [docs/tickets/README.md](../../../docs/tickets/README.md)
- Board tracker: [docs/tickets/BOARD.md](../../../docs/tickets/BOARD.md)
