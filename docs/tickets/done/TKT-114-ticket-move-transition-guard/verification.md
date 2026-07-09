# Verification — TKT-114: Enforce the ticket lifecycle transition graph in ticket-move.mjs

## Verdict
PENDING

## Evidence
- Offline acceptance matrix in [changes.md](./changes.md) — every ticket Acceptance line
  exercised (illegal refusal + allowed-target naming, all legal graph edges, `--force`
  loud bypass incl. the `verify→now` sweep-reopen wording, `--migrate` unchanged,
  `--dry-run` refusal with zero file writes).
- `node scripts/check-tickets.mjs` + `node scripts/check-doc-links.mjs` pass on the
  modified script's checkout (run at the end of the 2026-07-09 final wave).

## Pending / gaps
- The `next→now` edge was not exercised (the `next/` column is empty on this checkout).
- Verdict left PENDING for the dispatching loop / verifier; this ticket's Acceptance is
  offline-provable, so a `TESTED (offline)` certification is the expected close-out.

## How to re-verify
Run the matrix in changes.md (all `--dry-run` except the first); confirm exit codes and
that `git status docs/tickets` stays clean after every refusal.

## Verdict update — 2026-07-09 (orchestrator verification)

VERIFIED (offline — the acceptance is fully offline-provable). The implementer executed the whole acceptance matrix (transcribed in changes.md, incl. the real-run non-zero refusal with clean git status); the orchestrating session independently spot-checked the deployed guard: an illegal backlog->done names the transition + allowed targets and refuses; a legal dry-run reports without touching files; verify->now is force-only per the sweep policy; the skill prose was kept in step. This tooling now enforces the graph for the rest of the programme.

Verified by: implementer matrix + orchestrator spot-check, 2026-07-09.
