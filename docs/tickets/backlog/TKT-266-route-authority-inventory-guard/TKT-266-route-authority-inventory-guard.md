---
id: TKT-266
title: Add the route and authority inventory guard
status: backlog
priority: P2
area: platform
tickets-it-relates-to: [TKT-245, TKT-262, TKT-263, TKT-264, TKT-265]
research-link: docs/tickets/backlog/TKT-266-route-authority-inventory-guard/evidence/distillation-note.md
plan: PLAN-008
---

# Add the route and authority inventory guard

## Problem
The consolidations in this plan only hold if re-introducing a second path or a second auth helper fails a
check. Without a guard, a future change can re-add a duplicate capability route or a second local
`withServiceAuth`, silently restarting the drift this plan removes.

## Evidence
This plan exists because the codebase had two authoritative auth helpers (the second at
`mirror-outbox-routes.ts:42`), a capability reachable by more than one route (the BFF proxy re-exposing parser
and location-suggest), and three copies of the outbox drain. A guard modelling capability · owner · caller ·
auth mode · write authority would have caught each. `verify-all.mjs` and `scripts/checks/` host such a guard.

## Proposed change
Add a route/authority-inventory guard (import/AST-aware, not lexical) asserting one registered path per
capability and one authoritative writer per transition. It fails on: two authoritative writers for one
transition, an unowned route, or a second local auth helper claiming the same policy. Wire it into
`verify-all.mjs` with a negative fixture. Ship it last, after TKT-245 and TKT-262–265 land, so it passes on
merge.

## Acceptance
- **A1.** A guard under `scripts/checks/` builds a capability/route/authority inventory and fails on a
  duplicate registered path for one capability, an unowned route, or a second local auth helper claiming the
  internal-trust policy.
- **A2.** The guard is import/AST-aware, not a lexical grep, and does not false-flag the single shared trust
  seam or legitimate delegations.
- **A3.** Negative fixtures prove the guard fails on (a) a re-introduced second `withServiceAuth` and (b) a
  second registered path for a capability.
- **A4.** The guard runs inside `node verify-all.mjs` and in CI; it passes on the current tree after
  TKT-245/262–265 land.
- **A5.** No live write.

## Validation
- Run the guard over the tree (expect pass after the consolidations) and over the two negative fixtures
  (expect fail); confirm `verify-all.mjs` invokes it.

## Research
Distilled from `02-canonical-service-routes.md` step 5 (optional route-inventory guard) and the reconciled
review's authority/route-graph prescription plus Gate 0 item 12. Generalised across all plans by PLAN-012.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)
