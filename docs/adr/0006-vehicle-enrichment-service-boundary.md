# ADR-0006 — Vehicle enrichment has one REST service boundary

**Status:** Accepted (2026-06-17), current contract in [vehicle data](../architecture/vehicle-data.md).

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
