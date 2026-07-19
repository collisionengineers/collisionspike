---
id: TKT-255
title: Rationalise the bicep layout to one convention
status: backlog
priority: P2
area: platform
tickets-it-relates-to: [TKT-206, TKT-246, TKT-256]
research-link: docs/tickets/backlog/TKT-255-bicep-layout-rationalisation/evidence/distillation-note.md
plan: PLAN-009
---

# Rationalise the bicep layout to one convention

## Problem
Two bicep conventions coexist: a central set under `infrastructure/config-capture/` (`api.bicep`,
`orch.bicep`, `spa.bicep`) and per-Python-service `services/functions/*/infra/main.bicep`. The split makes the
infrastructure surface harder to navigate and is a drift risk; PLAN-006's locked structure names
`infrastructure` as the home.

## Evidence
Verified 2026-07-19: three central bicep files under `infrastructure/config-capture/` and six per-service
`services/functions/*/infra/main.bicep`. TKT-206's ADR-0017 rider sweep edits the per-service bicep files —
five of them carry dangling `ADR-0017` retention citations (the OCR bicep does not) — so the two efforts
touch the same files. The platform-topology ADR that would frame the chosen layout does not yet exist; it is
part of TKT-246's 0026–0030 backfill.

## Proposed change
Pick one bicep layout convention (centralise, matching PLAN-006's locked structure) and apply it. Record the
decision as a dated amendment to the platform-topology ADR minted by TKT-246. Coordinate ordering with
TKT-206's ADR-0017 rider sweep so the two do not collide on the shared per-service bicep files (sequence after
the riders land, or partition the edits explicitly).

## Acceptance
- **A1.** One bicep layout convention is chosen and applied; the mixed central/per-service split is resolved
  to the single convention named in PLAN-006's locked structure.
- **A2.** The decision is recorded as a dated `## Amendment` to the platform-topology ADR minted by TKT-246,
  citing this ticket as the driver.
- **A3.** The change does not collide with TKT-206's ADR-0017 rider edits to the per-service
  `infra/main.bicep` files; the ordering or partition is recorded in `changes.md`.
- **A4.** No resource name, deployment parameter, or runtime behaviour changes — a what-if / plan diff shows a
  layout-only change and `check:runtime-contract` stays clean where applicable.
- **A5.** No live deployment is performed by this ticket (bicep authoring only; any deploy is separately
  authorised).

## Validation
- What-if / plan diff shows layout-only change; the ADR amendment resolves and is dated; `changes.md` records
  the TKT-206 coordination.

## Research
Distilled from `03-cloud-estate-cleanup.md` scope item 4; the two-convention split, the TKT-206 rider
collision (five per-service bicep files carry the dangling ADR-0017 citation), and the absence of the topology
ADR were re-verified read-only on 2026-07-19 (`PLAN-009.dossier`). Gated on TKT-246.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)
