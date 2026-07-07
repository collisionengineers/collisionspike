# Changes — TKT-108: Completed tickets → a done/ folder

## Status
done — delivered as the broader status-folder ticket-system restructure requested by the user.

## Commits
- pending — ticket-system restructure: status folders, verify state, plans layer, move tooling, validation gates, and skill updates.

## Files touched
- `docs/tickets/` — migrated tickets into `backlog/`, `now/`, `next/`, `verify/`, `done/`, and `blocked/` status folders; added `plans/` and new tickets TKT-109…113.
- `scripts/check-tickets.mjs` — validates placement, frontmatter, BOARD parity, plans, and eval-manifest paths.
- `scripts/ticket-move.mjs` — sanctioned ticket status transition/migration command.
- `scripts/check-skills-sync.mjs` — verifies duplicated shared skills stay byte-identical.
- `scripts/hooks/pre-commit`, `.github/workflows/docs.yml` — wired the new gates.
- `docs/tickets/README.md`, `docs/tickets/BOARD.md`, `CLAUDE.md`, `docs/MAINTENANCE.md` — documented the new system.
- `.agents/skills/` and `.claude/skills/` — updated `ticket-implement`, `ticket-distill`, and added `ticket-plan`.

## Summary
The original done-folder request was implemented as the accepted superset: all tickets now live in status folders, with `verify` as a first-class state for deployed work awaiting proof. The move script keeps frontmatter, folder placement, BOARD rows, and links in sync. The plans layer tracks multi-ticket programmes without moving with ticket status.
