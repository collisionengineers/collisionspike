# Changes — TKT-114

## Status

Implemented. PLAN-006 extends the original transition guard so each successful move also regenerates all
derived ticket views and rewrites inbound ticket-tree links within the same rollback boundary.

## Files

- `scripts/maintenance/ticket-move.mjs`
- `scripts/maintenance/ticket-generate.mjs`
- `scripts/maintenance/ticket-system.mjs`
- `scripts/checks/check-tickets.mjs`
