---
id: TKT-264
title: Generalise the outbox drain to one drain plus a target registry
status: backlog
priority: P2
area: platform
tickets-it-relates-to: [TKT-246, TKT-249, TKT-266]
research-link: docs/tickets/backlog/TKT-264-outbox-drain-generalisation/evidence/distillation-note.md
plan: PLAN-008
---

# Generalise the outbox drain to one drain plus a target registry

## Problem
The outbox-drain pattern is stamped out three times — one triple of `*-outbox-routes.ts` (data-api) +
`*-monitor.ts` + `*-api.ts` (orchestration) per lane. A reliability or generation-counter fix must be made in
three places, and the three drift.

## Evidence
Verified read-only 2026-07-19: three lanes carry the same triple — archive-mirror
(`mirror-outbox-routes.ts` + `archive-mirror-monitor.ts` + `archive-mirror-api.ts`), provider-archive
(`provider-outbox-routes.ts` + `provider-archive-monitor.ts` + `provider-archive-api.ts`), and box-file-request
(`file-request-outbox-routes.ts` + `box-maintenance-monitor.ts` + `box-maintenance-api.ts`). The third lane's
monitor and adapter are filed under the `box-maintenance-*` name but are the box-file-request drain
(`BOX_FILE_REQUEST_MONITOR_INSTANCE_ID`, `boxFileRequestOutboxMonitorOrchestrator`).

## Proposed change
Collapse the three copies to one generic outbox drain plus a target registry that names each lane's route,
monitor instance, and adapter. This **waits on** the outbox/generation-counter reliability ADR (expected
ADR-0030) from TKT-246, so the generalisation amends a decision of record instead of racing it. Preserve each
lane's durable/idempotency behaviour exactly.

## Acceptance
- **A1.** One generic outbox drain plus a target registry replaces the three per-lane drains; each lane is a
  registry entry (route + monitor instance id + adapter), not a copied triple.
- **A2.** Durable orchestration ids, generation-counter semantics, and idempotency behaviour are unchanged
  (`check:runtime-contract` clean; the archive gates tests pass).
- **A3.** The generalisation amends the outbox-reliability ADR minted by TKT-246 (number not pre-assigned);
  the box-file-request lane is correctly modelled despite its `box-maintenance-*` filenames.
- **A4.** The net file/LOC delta is negative; both services build.
- **A5.** No live write.

## Validation
- `check:runtime-contract` + the archive gates tests; drive one lane's drain end-to-end; report the file/LOC
  delta; full `node verify-all.mjs`.

## Research
Distilled from `02-canonical-service-routes.md` step 4; the three triples and the `box-maintenance`-named
file-request lane were re-verified read-only on 2026-07-19 (`PLAN-008.dossier`). Waits on TKT-246's
outbox-reliability ADR.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)
