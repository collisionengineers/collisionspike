# Changes — TKT-256: Assess helper-app consolidation (read-only)

## Status

Implemented on branch `plan009/estate-nonmutating`. Read-only assessment; no resource modified.

## What changed

- Filed `docs/operations/helper-app-consolidation-assessment.md` — a dated (2026-07-19), self-contained
  read-only assessment of the helper Function Apps' plan / storage / Application-Insights topology and
  the consolidation trade-offs, grounded in a read-only ARM resource inventory of `rg-collisionspike-dev`.
- The assessment states explicitly that **Application Insights is already largely shared** and is not
  simplified by a plan/storage consolidation, and makes a **keep the per-service isolation**
  recommendation with the cold-start / identity / deployment-blast-radius / heterogeneous-hosting (OCR on
  Container Apps) rationale.
- It is structured as an input PLAN-011 can consume for its Python sharing calculus, and closes on its
  own filing (it does not wait on PLAN-011 landing).
- Resource-level specifics are held in `LIVE_FACTS.json`, not duplicated into the assessment prose (no
  live-fact leakage).

## What did NOT change

No Azure resource was created, modified, or deleted; no plan or storage account was consolidated. The
deliverable is the assessment document only.
