# Changes — TKT-094

## Status

Implemented and offline-tested; awaiting one genuine staff export for live behavioral proof.

## Current source

- `packages/domain/src/contracts/case-status.ts` — stable status contract.
- `services/data-api/src/features/cases/terminal-transition.ts` — guarded, idempotent transition.
- `services/data-api/src/features/cases/` — staff EVA-submitted route.
- `services/data-api/src/features/` — service completion route used by TKT-095.
- `apps/web/src/features/cases/EvaSubmitDialog.tsx` — export, transition and refresh behavior.
- `database/migrations/2026-07-09-case-done.sql` — replay-safe status/audit delta.

Current tests compare the domain code table, API codec and database baseline directly; no separate
metadata parity utility is used.
