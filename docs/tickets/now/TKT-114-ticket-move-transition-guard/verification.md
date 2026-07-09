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
