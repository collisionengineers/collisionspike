# Changes — TKT-213: Reconcile tickets, indexes, plans and research links

## Status
verify — ticket authority, generated views, plan membership, research links and evaluation references
are reconciled offline; all PLAN-006 members are in the verification queue. Re-verified against the
current tree on 2026-07-19 (267 tickets, 12 plans after PLAN-007..012 landed); the parity invariant
still holds at the larger size. See verification.md for per-criterion evidence.

## Commits
- Current PLAN-006 implementation following the baseline and mechanical move commits.
- 2026-07-19 evidence refresh: verification.md/changes.md re-verified against the current tree
  (207/6 close-out snapshot explicitly superseded, not silently overwritten — see A9).

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
