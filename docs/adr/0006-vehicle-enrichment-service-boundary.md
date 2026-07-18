# ADR-0006 — Vehicle enrichment has one REST service boundary

**Status:** Accepted (2026-06-17); amended 2026-07-16 per [Review 160726](../reviews/160726/decisions.md). Current contract in [vehicle data](../architecture/vehicle-data.md).

## Decision

The focused vehicle-enrichment service calls DVLA and DVSA directly with approved service credentials and
returns the versioned vehicle-data contract. It owns registration normalization, provider transport, raw
snapshots, MOT cleaning, and displayed-mileage estimation.

The Data API owns applying a result to a Case. The instruction remains authoritative: enrichment fills or
suggests absent/invalid fields and never silently replaces a supplied value. VAT is not a vehicle-provider
fact and remains a staff value.

## Rationale

A single boundary prevents copied provider clients and divergent mileage algorithms across the web app,
orchestration, and other tools.

## Consequences

All callers use the same Data API route and stable operation identity. Raw provider evidence, model/rule
versions, warnings, and staff disposition are retained.

## Amendment — mileage precedence and DVSA cross-check (2026-07-16)

Displayed mileage follows a precedence hierarchy: a staff-entered value, then the instruction, then a
reading from an odometer image, then the MOT-history estimator (per TKT-152). The odometer-image tier's
vision reader is not built; reading an odometer with the approved vision model is a decided direction
whose adoption defers to the model-adoption gate in
[ADR-0009](./0009-image-processing-suggestion-first.md). A discrepancy flag comparing the chosen
mileage against the DVSA MOT history is a new decision (decided 2026-07-16; not built — TKT-241).
