---
id: TKT-276
title: Unify the two case status-recompute authorities and the generation-counter ack
status: done
priority: P2
area: platform
tickets-it-relates-to: [TKT-270, TKT-266]
research-link: docs/tickets/done/TKT-270-hardcore-repository-drift-audit/evidence/audit-report-2026-07-20.md
---

# Unify the two case status-recompute authorities and the generation-counter ack

## Problem
The TKT-270 audit found two authoritative writers of `case_.status_code` and a duplicated
`status_recompute_completed_generation` advance — the residual duplicate authority PLAN-008 left behind (it
consolidated the internal trust seam and route aggregation but not this status-write domain logic).

## Evidence (TKT-270 findings A1–A2)
- **A1** — two same-named `recomputeStatus` functions (`features/cases/case-support.ts:205` and
  `features/inbound/internal/service-support.ts:119`) each authoritatively advance `case_.status_code` via the
  identical `statusForReviewCase(readinessInputForCase(...))` contract, `writeAudit(status_changed)`, and
  `maybeSuggestOverviewChase`. The split is not a lane boundary — the staff (`withRole`/`withVehicleLookupAuth`)
  lane invokes both.
- **A2** — `service-support.recomputeStatus` re-inlines the `GREATEST/LEAST` generation-ack SQL that
  `features/cases/status-recompute.ts:27` exposes as the canonical `acknowledgeStatusRecompute` (the single
  `writeAuthority` for `status_recompute_completed_generation` in `route-authority-inventory.json`).

## Proposed change
Unify the two `recomputeStatus` implementations into one parametrised writer (the `acknowledgeGeneration` vs
`actor` difference becomes a parameter), and route its generation-ack through `acknowledgeStatusRecompute`
rather than re-inlining the SQL. Behaviour-preserving: identical transition, audit, and follow-on side effects;
the internal and staff paths keep their observable responses. `check:runtime-contract` and `check:route-authority`
stay clean.

## Acceptance
- One authoritative `recomputeStatus` writer; both the staff and internal paths call it with their existing
  parameters. The generation-counter advance has a single implementation (`acknowledgeStatusRecompute`).
- Every existing route response, audit action, and `maybeSuggestOverviewChase` behaviour is preserved;
  `check:runtime-contract` byte-identical; `check:route-authority` still PASS (one writeAuthority per transition).
- Affected data-api suites pass; net LOC negative; no live write.

## Research
Distilled from the TKT-270 audit report (2026-07-20), findings A1–A2.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
