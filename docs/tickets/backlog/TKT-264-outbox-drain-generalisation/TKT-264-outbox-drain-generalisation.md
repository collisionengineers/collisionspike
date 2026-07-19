---
id: TKT-264
title: Share the outbox monitor lifecycle without flattening lane protocols
status: backlog
priority: P2
area: platform
tickets-it-relates-to: [TKT-246, TKT-249, TKT-266]
research-link: docs/tickets/backlog/TKT-264-outbox-drain-generalisation/evidence/distillation-note.md
plan: PLAN-008
---

# Share the outbox monitor lifecycle without flattening lane protocols

## Problem
Three Archive-related lanes each have Data API routes, an orchestration monitor, and an adapter, but only their
Durable wake/retry/reschedule/bootstrap lifecycle is structurally duplicated. Their data-plane correctness
protocols differ, so treating all three as one generic drain would erase ownership and acknowledgement rules.

## Evidence
Verified in source and the live registered functions on 2026-07-19:

- archive mirror and provider Archive each expose pending/complete/defer generation endpoints and distinct
  row-verification/sub-orchestrator logic;
- File Request exposes one API-owned atomic `/drain` endpoint, with orchestration acting only as a wake-safe
  caller; and
- `box-maintenance-monitor.ts` also owns the unrelated Box classification singleton, sweep activity, shared
  `/maintenance/box-monitors` route, and bootstrap logic.

## Proposed change
After TKT-246 records the outbox/generation-counter reliability decision, extract only the common Durable
monitor lifecycle into a typed definition/helper: retry policy, durable timer, `continueAsNew`, singleton
status/readback, and bootstrap where semantics genuinely match. Keep lane-specific workflows, API protocols,
adapters, generation checks, and remote-write ownership explicit. Split the Box classification monitor into a
clear independent module before changing File Request plumbing, while preserving all registered names and the
combined management route contract.

## Acceptance
- **A1.** A shared Durable-monitor lifecycle helper/definition removes only proven duplicate lifecycle code;
  archive mirror and provider Archive retain pending/complete/defer protocols, and File Request retains its
  API-owned atomic drain.
- **A2.** The Box classification singleton, sweep activity, interval, bootstrap, and
  `/maintenance/box-monitors` management response are separated from File Request ownership and preserved.
- **A3.** Every existing Function registration name, singleton instance ID, interval, retry policy, route,
  generation-counter rule, idempotency rule, and remote-write owner is unchanged
  (`check:runtime-contract` and archive monitor/gate tests pass).
- **A4.** The change amends the outbox-reliability ADR minted by TKT-246 (number not pre-assigned) and records
  which lifecycle behavior is shared versus lane-owned.
- **A5.** The net file/LOC delta is negative; both services build.
- **A6.** No live write.

## Validation
- `check:runtime-contract` plus all three lane monitor suites and the classification monitor suite; drive each
  distinct protocol once, verify the management route still reports both File Request and classification,
  report the file/LOC delta, and run full `node verify-all.mjs`.

## Research
Distilled from `workingspace/architecture-simplification/02-canonical-service-routes.md` step 4, then corrected
against the three route modules, monitors, adapters, and live Function registrations on 2026-07-19. Waits on
TKT-246's outbox-reliability ADR.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Distillation note](./evidence/distillation-note.md)
