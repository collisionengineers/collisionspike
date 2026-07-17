# Changes — TKT-223: Re-run retro reconstruction for previously failed drain rows

## Status
verify — built + deployed 2026-07-16 (same session as TKT-219); live force-rerun proof recorded
in verification.md.

## What changed

- `services/orchestration/src/workflows/retro/retro-case.ts` — `RetroCaseInput.force`; the
  starter's dedupe now distinguishes LIVE instances (never restarted) from finished ones:
  Failed/Terminated restart as before, Completed restarts only with `force: true` (logged).
