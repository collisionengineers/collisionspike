# Operator note — ticket-move transition guard (distilled 2026-07-08)

Context: while building the ticket-orchestration layer (the `ticket-orchestrate` skill + the
`ticket-verifier` / `ticket-implementer` agents), we confirmed that `scripts/ticket-move.mjs` allows
**any** status→status move — the lifecycle graph documented in `docs/tickets/README.md` (§ Lifecycle)
is not enforced anywhere: not by the mover, not by `check-tickets.mjs`. A wrong move (e.g.
`backlog → done`, skipping the verify evidence gate) succeeds silently and only a human reading the
BOARD would notice.

The orchestrator skill now encodes the allowed transitions in prose, but a prose guard depends on the
agent honouring it. The operator-agreed follow-up (2026-07-08 planning session): enforce the graph
deterministically in the script itself, with an escape hatch.

Agreed shape:
- Validate the requested transition against the README lifecycle graph before moving.
- `--force` flag bypasses the guard for deliberate exceptional moves (printed loudly).
- `--migrate` mode stays exempt (it realigns folders to frontmatter, not transitions).
- `--dry-run` reports the verdict the same way a real run would.
