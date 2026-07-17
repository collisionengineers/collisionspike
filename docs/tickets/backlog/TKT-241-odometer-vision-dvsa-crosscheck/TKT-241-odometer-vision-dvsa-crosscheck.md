---
id: TKT-241
title: Odometer image reader and DVSA mileage cross-check flag
status: backlog
priority: P3
area: enrichment
tickets-it-relates-to: [TKT-152]
research-link: docs/reviews/160726/decisions.md
---

# Odometer image reader and DVSA mileage cross-check flag

## Problem

TKT-152's mileage precedence hierarchy includes an odometer-image tier, but no vision odometer reader
exists to feed it, and nothing flags a chosen mileage that contradicts the DVSA MOT history
(Review 160726 D17; ADR-0006 amendment 2026-07-16).

## Evidence

- [Review 160726 decision D17](../../../reviews/160726/decisions.md).
- ADR-0006, Amendment — mileage precedence and DVSA cross-check (2026-07-16); ADR-0009's
  model-adoption gate governs the vision use.

## Proposed change

PROPOSED (not built):

- Read the odometer value from an odometer image with the approved vision model, as a suggestion
  feeding the TKT-152 precedence tier — subject to ADR-0009's data-protection approval,
  representative evaluation, versioned output, and fail-closed gate.
- Add a discrepancy flag comparing the chosen mileage against the DVSA MOT history; the flag is
  informational for staff, never a blocker or an override.

## Acceptance

- An odometer image produces a suggested reading with model identity and versioned output, and the
  precedence hierarchy consumes it in its decided position.
- A mileage implausible against MOT history shows a reviewable discrepancy flag with its evidence.
- The vision path passes the ADR-0009 gate requirements before any live use.

## Research

Distilled 2026-07-17 from [Review 160726](../../../reviews/160726/decisions.md) (D17).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
