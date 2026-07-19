---
id: TKT-256
title: Assess helper-app consolidation (read-only)
status: backlog
priority: P3
area: platform
tickets-it-relates-to: [TKT-246, TKT-255]
research-link: docs/tickets/backlog/TKT-256-helper-app-consolidation-assessment/evidence/distillation-note.md
plan: PLAN-009
---

# Assess helper-app consolidation (read-only)

## Problem
Each focused function app carries its own App Service plan and storage account. The draft asked whether
consolidating that topology is worth it. The answer needs a written trade-off, not a change.

## Evidence
Read-only live pass 2026-07-19: App Service plans are one-per-app (all Flex/FC1), storage accounts are
one-per-app, but Application Insights is **already largely shared** — a small number of components serve all
the apps, most routing to one shared component. So plan/storage consolidation would not simplify telemetry,
which is already consolidated. Per-app function counts vary widely.

## Proposed change
Produce a read-only assessment weighing consolidation's maintenance win against its migration risk
(cold-start, identity, deployment blast radius, per-app scaling isolation), grounded in the actual topology.
Execute no change. The output feeds PLAN-011's Python sharing calculus.

## Acceptance
- **A1.** A written assessment covers, per function app, its plan / storage / App-Insights topology and the
  consolidation trade-offs, and states explicitly that Application Insights is already shared and is not
  simplified by plan/storage consolidation.
- **A2.** The assessment makes a keep-or-consolidate recommendation with the risk rationale and executes no
  change (read-only).
- **A3.** The output is referenced by PLAN-011 as an input to its Python sharing decision.
- **A4.** Evidence is banked with timestamps; no live mutation occurs.

## Validation
- The assessment document exists, is dated, and is linked from PLAN-011's decision ticket; no resource is
  modified.

## Research
Distilled from `03-cloud-estate-cleanup.md` scope item 5; the plan/storage one-per-app topology and the
already-shared App Insights fan-in were re-verified read-only on 2026-07-19 (`PLAN-009.dossier`), which
corrects the draft's "each carry their own App Insights". Gated on TKT-246's topology framing.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)
