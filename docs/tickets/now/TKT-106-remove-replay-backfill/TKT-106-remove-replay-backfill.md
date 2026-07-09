---
id: TKT-106
title: "Remove the non-viable replay-backfill driver + gate"
status: now
priority: P2
area: intake
tickets-it-relates-to: [TKT-059]
research-link: docs/tickets/blocked/TKT-059-replay-wipe-rebuild/verification.md
---

# Remove the non-viable replay-backfill driver + gate

## Problem

The **wipe-and-rebuild-from-mailbox** path (TKT-059) is **non-viable and abandoned**: the dry-run
proved the intake Inboxes retain only ~88 of 390 source emails (staff file/delete processed mail into
Deleted Items, 7–9k each), so a wipe would destroy ~150 cases it could not rebuild from the mailbox
(see [TKT-059 verification](../../blocked/TKT-059-replay-wipe-rebuild/verification.md) Finding 1). The gentler
in-place reprocess was shown **safe but low-value** (the stored classifications are largely correct).

The **`replay-backfill` Durable driver ships DARK** (`REPLAY_BACKFILL_ENABLED=false`) and will never be
turned on for the destructive path. Dead, permanently-off code **bloats the orch bundle and leaves
references (`REPLAY_BACKFILL_ENABLED`, `replay-<epoch>` namespaces, the manifest lib) that can mislead a
later session** into thinking a wipe/replay is a live option. Remove it.

## What the dry-run learning WAS worth keeping

The *finding* (mailboxes are a lossy store; the DB is the system of record; the classifier is sound) is
valuable and is already captured in **TKT-059 verification.md** + the memory
`[[replay-mailboxes-do-not-retain-history]]`. **Keep that knowledge; delete only the dead driver.**

## Scope (remove)

- `orchestration/src/functions/gated/replay-backfill.ts` — the whole driver (the `POST /api/replay-backfill`
  HTTP starter + the replay orchestrator + its collect/classify/process activities).
- The import at `orchestration/src/index.ts` (`import './functions/gated/replay-backfill.js'`).
- `orchestration/src/lib/replay-manifest.ts` — **only if** no other consumer remains (verify: `compareByReceived`
  / `mergeChronological` / `tallyByCategory` are grep-clean outside the driver + its test) — plus its test.
- The `replayBackfill` gate in `packages/domain/src/gates.ts` (+ any `REPLAY_BACKFILL_ENABLED` reference).
- The `REPLAY_BACKFILL_ENABLED` app-setting on `cespk-orch-dev` (delete the setting).
- Doc references: mark TKT-059 as superseded-and-driver-removed (keep its findings), scrub any
  `REPLAY_BACKFILL_ENABLED` mention in `docs/gated.md` / CLAUDE.md / LIVE_FACTS if present.

## Acceptance

- The orch bundle rebuilds + deploys with the driver gone; function count drops by the driver's routes;
  `node verify-all.mjs` green; no dangling `replay` / `REPLAY_BACKFILL_ENABLED` references (grep-clean
  except the TKT-059 historical record).
- TKT-059's non-viability finding remains documented (not lost with the code).
- LIVE_FACTS + the board updated; the gate removed from the live app-settings.

## Notes

Operator-requested 2026-07-07 while auditing the dark gates. This is a code change → a PR (not
straight-to-main); the removal is mechanical but touches the orch bundle + a live app-setting, so it
carries a deploy.

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
