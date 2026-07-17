---
id: TKT-223
title: Re-run retro reconstruction for previously failed drain rows (force restart)
status: verify
priority: P2
area: intake
tickets-it-relates-to: [TKT-219, TKT-140, TKT-058]
research-link: docs/tickets/verify/TKT-223-retro-force-rerun/TKT-223-retro-force-rerun.md
plan: PLAN-004
---

# Re-run retro reconstruction for previously failed drain rows (force restart)

## Problem

The drain lever (`POST /api/retro-case`) dedupes on the deterministic instance id and refuses to
restart any instance that is not `Failed`/`Terminated` — but a FAILED RECONSTRUCTION completes
successfully with outcome `no_source` / `trigger_not_found`, so the stranded pile (6 no_source +
19 trigger_not_found from TKT-140, plus future `unable_to_locate` rows) can never be re-driven,
even after conditions change (deeper Outlook paging, the Box archive grant, new search keys).
Operator ask 2026-07-16: "can we rerun the retro for failed cases?"

## Change

`RetroCaseInput.force` (TKT-219 session): `force: true` restarts a COMPLETED instance; a
Running/Pending instance is never force-restarted. Safe by construction — rung 1 links first,
the create is get-or-create under the live mint's advisory locks + unique backstops, and an
already-linked inbound row is never re-pointed, so the worst case of a re-run is a fresh visible
failure record.

## Acceptance

- `POST /api/retro-case` with `force: true` restarts a Completed drain instance (live-proven);
  without `force` the dedupe behaviour is unchanged; a live instance is never double-run.
- The failed-row pile can be re-driven after the Box archive Viewer grant lands (the TKT-219
  verification's outstanding item) — re-drain evidence recorded when that happens.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
