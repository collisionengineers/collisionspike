# Changes — TKT-019

## Status

Implemented. PLAN-006 replaces the hand-maintained views with generated output while retaining the
status-folder lifecycle established by this ticket.

## Current files

- `scripts/maintenance/ticket-system.mjs` — shared discovery, frontmatter and rendering rules.
- `scripts/maintenance/ticket-generate.mjs` — board, index, plan-membership and progress generation.
- `scripts/maintenance/ticket-move.mjs` — guarded lifecycle transitions and atomic regeneration.
- `scripts/checks/check-tickets.mjs` — complete ticket-system validator.

No ticket status was changed while reconciling the generated views.
