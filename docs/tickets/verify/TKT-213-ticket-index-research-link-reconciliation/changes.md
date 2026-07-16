# Changes — TKT-213: Reconcile tickets, indexes, plans and research links

## Status
verify — ticket authority, generated views, plan membership, research links and evaluation references
are reconciled offline; all PLAN-006 members are in the verification queue.

## Commits
- Current PLAN-006 implementation following the baseline and mechanical move commits.

## Files touched
- docs/tickets status folders and ticket artifacts
- docs/tickets/BOARD.md
- docs/tickets/README.md
- docs/tickets/plans
- docs/operations/operator-actions.md
- scripts/maintenance/ticket-system.mjs
- scripts/maintenance/ticket-generate.mjs
- scripts/maintenance/ticket-move.mjs
- scripts/checks/check-tickets.mjs

## Summary
Ticket specs remain the sole authority. BOARD, index, plan progress and operator actions are generated
views. Research/evaluation links and moved source references now resolve against the current tree, and
ticket moves update inbound links and views atomically.
