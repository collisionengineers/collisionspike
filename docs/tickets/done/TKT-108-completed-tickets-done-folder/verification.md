# Verification — TKT-108: Completed tickets → a done/ folder

## Verdict
TESTED (offline)

## Evidence
- `node scripts/check-tickets.mjs` passed after migration: 110 tickets, 2 plans, 0 failures, 0 warnings.
- The move workflow was exercised with `node scripts/ticket-move.mjs --migrate --dry-run`, then `node scripts/ticket-move.mjs --migrate`.
- The TKT-108 close-out itself is dogfooded with `node scripts/ticket-move.mjs TKT-108 done`.

## Pending / gaps
No live system proof is required for this docs/tooling ticket. Broader link and hook checks are recorded in the final session validation.

## How to re-verify
Run:

```sh
node scripts/check-tickets.mjs
node scripts/check-doc-links.mjs
node scripts/check-skills-sync.mjs
scripts/hooks/pre-commit
```

Then confirm `docs/tickets/done/TKT-108-completed-tickets-done-folder/` exists and BOARD links to the done-path row.
