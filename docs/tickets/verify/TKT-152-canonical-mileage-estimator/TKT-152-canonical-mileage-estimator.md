---
id: TKT-152
title: Consolidate vehicle lookups and harden the MOT mileage estimator
status: verify
priority: P1
area: enrichment
tickets-it-relates-to: [TKT-044, TKT-151]
research-link: docs/tickets/verify/TKT-151-vehicle-enrichment-completeness/evidence/followup-2026-07-13/issue.md
plan: PLAN-004
---

# Consolidate vehicle lookups and harden the MOT mileage estimator

## Problem
DVLA/DVSA lookup and mileage-estimation logic is duplicated across the repository. The current estimator is a copied port based on the latest two intervals and a fixed percentage band; it does not robustly handle retests, units, bad readings, odometer resets, stale history, target-date interpolation, or calibrated uncertainty.

## Evidence
- [Operator note](./evidence/operator-note.md) — one source of truth plus the supplied estimator design.
- TKT-044 — existing mileage arithmetic check.
- `services/functions/vehicle-enrichment/vehicle_data/mileage.py` — canonical estimator implementation.

## Current implementation
The versioned vehicle-data contract and owning service are implemented under
`services/functions/vehicle-enrichment/vehicle_data/`. Runtime callers use that contract and the
auditable estimator is covered by chronological holdout fixtures. Production calibration, deployment
and independent live verification remain the open gates recorded in the ticket artifacts.

## Acceptance
- A repository inventory identifies every DVLA/DVSA client, response model, registration normaliser, MOT cleaner, mileage calculation, cache, and caller; the final architecture names exactly one owning package/service and contract.
- All runtime callers use the canonical contract. Duplicate calculation/business-rule implementations are removed or reduced to thin adapters with contract tests; credentials and provider HTTP details stay behind the owning service.
- A repository and sibling-integration scan proves that only one handwritten estimator remains; every
  other caller delegates to the canonical source and is guarded by contract tests.
- Raw MOT records remain immutable and auditable with source, retrieval time, test number/date/result, original odometer value/unit/result type, and registration-at-test or stable vehicle identity where available.
- Cleaning normalises miles/kilometres, orders and deduplicates tests, consolidates fail/retest episodes, excludes intervals under 90 days from annual-usage estimation, and records rather than overwrites rejected observations.
- Negative changes, isolated keying spikes/dips, persistent lower-reading segments, unit contradictions, zero movement, and extreme annualised usage produce explicit warnings and deterministic inclusion/segmentation decisions. Unresolved reset/unit ambiguity causes abstention or a displayed-segment-only result.
- Target dates on an observed MOT return the observation; dates between trusted observations use bounded interpolation; dates after the latest use a recent recency/quality-weighted robust rate; pre-first-MOT estimates are cohort-assisted only when defensible and otherwise abstain.
- Sparse histories blend with a versioned similar-vehicle prior whose weight reduces as trustworthy vehicle intervals increase. No unvalidated hard-coded confidence score is presented as probability.
- Estimates are labelled as displayed-odometer estimates, rounded to the nearest 100 miles, include method, evidence used, annual rate, warnings, and an empirically calibrated prediction interval; exact readings remain exact.
- Forecasts older than the validated horizon (two years by default until backtesting proves otherwise) return insufficient evidence or range-only rather than false precision.
- Chronological holdout backtesting reports MAE, median absolute error, interval coverage and useful-tolerance coverage by horizon, vehicle type/age, clean-interval count, volatility, and anomaly class. Calibration data/model version is reproducible.
- The replacement materially matches or improves the current baseline on held-out data and reaches the declared interval coverage; otherwise it does not ship as the default.
- TKT-044's named real cases and anomaly fixtures are re-evaluated through the canonical implementation,
  with before/after results and reasons recorded.
- Live enrichment uses only the canonical path, emits observable method/warning metadata, and leaves a case Not Ready when mileage evidence is insufficient under the business requirement.
- Architecture, runbook, API contract, and operator-facing wording are updated without exposing provider/cloud implementation language in the app.
- Mileage source precedence is explicit and shared by intake, retry, case editing and readiness: a valid
  staff-confirmed value wins; otherwise use a valid mileage from the instruction/document; otherwise use a
  readable odometer image; only when neither source exists may the MOT-history estimator autofill.
- A lower-precedence estimate never silently replaces a higher-precedence value. Conflicting instruction
  and odometer evidence is surfaced for resolution rather than selecting MOT as a tie-breaker.
- A.QDOS26088 is a pinned third-option regression: when instruction mileage and readable odometer evidence
  are absent, a successful MOT lookup produces the canonical estimate and source metadata automatically.

## Validation

- A table-driven precedence suite covers every combination of staff value, instruction value, odometer
  observation, MOT estimate, invalid source and conflict, asserting value, source, warning and readiness.
- The A.QDOS26088 fixture proves the third-option autofill; paired fixtures prove MOT is not called or applied
  when valid instruction or odometer mileage exists.
- Live verification captures the source label and estimator metadata on one third-option case and confirms
  rerun/idempotency plus preservation of a later staff-confirmed value.

## Research
Distilled 2026-07-12 from the operator request and the two supplied MOT-estimator conversations; the accepted design is recorded in [evidence/operator-note.md](./evidence/operator-note.md).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
