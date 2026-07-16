# Changes — TKT-106: Remove the non-viable replay-backfill driver + gate

## Status
Built (2026-07-09, PLAN-003 lifecycle wave) — removal code-complete on `feat/lifecycle-wave`;
orch redeploy + the live `REPLAY_BACKFILL_ENABLED` app-setting deletion + function-count
re-verify pending (deploy phase).

## Commits
- (uncommitted on `feat/lifecycle-wave` — the dispatching loop owns commits)

## Removed
- The whole replay driver: keyed HTTP starter, replay orchestrator and collect/classify/process
  activities. The orchestration function count drops by the driver's registrations at redeploy.
- The driver's private manifest helpers and tests; the driver was their only consumer.
- `services/orchestration/src/adapters/graph.ts` — the driver-only windowed pager `listMessagesSince` + its
  `ReplayPageItem` projection (grep-verified single consumer); a pointer comment marks the
  removal. The retro `$search` machinery (ADR-0022 R3) is untouched.
- `services/orchestration/src/index.ts` — removed the driver's entry-point registration.
- `packages/domain/src/gates.ts` — the `replayBackfill` gate accessor (replaced by a removal-note
  comment; no other `REPLAY_BACKFILL_ENABLED` reader remains in code).

## Docs scrubbed (finding preserved)
- `docs/tickets/README.md` — the gate row now records the REMOVAL (strikethrough)
  and the Reprocess row cites the removal; the in-place-reprocess plan wording is retained.
- TKT-059's spec/changes/verification are deliberately LEFT INTACT — they are the prior
  record of the non-viability finding (mailboxes retain only ~88/390 source emails; the DB is
  the system of record) that this removal preserves.
- `LIVE_FACTS.json` gates block: the `REPLAY_BACKFILL_ENABLED` entry is removed at the deploy
  phase together with the live app-setting deletion (they must move together or
  `VERIFY_LIVE` diffs).

## Offline gates (2026-07-09)
- Orch builds + its vitest suite passes with the driver gone (run as part of the wave's combined
  orch gate); `@cs/domain` vitest 1058 passed post-gate-removal.

## Remaining (deploy phase, dispatcher-owned)
1. `az functionapp config appsettings delete -g rg-collisionspike-dev -n cespk-orch-dev --setting-names REPLAY_BACKFILL_ENABLED`
2. Redeploy orch; `az functionapp function list … | wc -l` — count drops (~5 registrations);
   update `LIVE_FACTS.json` functionCounts + gates + the live-environment mirror.
3. Grep-clean re-check: `REPLAY_BACKFILL_ENABLED` remains only in the TKT-059/TKT-106 prior
   records + LIVE_FACTS changelog narrative.
