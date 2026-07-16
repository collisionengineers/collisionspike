# Vehicle data and displayed-mileage estimation

The sole case-workflow vehicle-data owner is `services/functions/vehicle-enrichment/vehicle_data`.
Provider credentials and transport live in its adapters. Every caller receives the versioned
[vehicle-data contract](../../contracts/vehicle-data-v1.schema.json).

The Data API applies a validated result to a Case, preserves the immutable lookup evidence, and exposes
plain-language warnings and retry. Web and orchestration callers do not clean MOT rows, calculate a rate,
choose a mileage point, or interpret confidence independently.

## Estimation rules

1. Preserve every raw observation, then order, deduplicate, and group fail/retest episodes.
2. Convert only recognized mile/kilometre units. Contradictory or unknown units block an unsafe result.
3. Exclude implausible or low-information intervals from rate estimation without deleting them.
4. Treat a corroborated odometer drop as a new segment; abstain when the latest drop is unresolved.
5. Use a recency/quality-weighted median of clean rates. Use a versioned cohort prior only for sparse
   histories and only when its sample checks pass.
6. Return exact observations on exact MOT dates; interpolate only within a compatible segment; forecast
   only within the validated horizon.
7. Produce calibrated intervals only from eligible chronological holdouts. Otherwise show a wider,
   explicitly non-probabilistic range and do not default it into the Case.

The case mileage field is digits-only. A narrow machine/provider boundary may normalize an exact unit
suffix; arbitrary prose is rejected.

## Persistence and replay

Lookup runs, provider snapshots, odometer observations, estimate results, and model profiles are
append-only. Each result stores model/rule versions, raw digests, decision codes, and selection flags.
A stable caller replay key binds to the operation request; identical retries return the first committed
envelope and a different request under the same key is rejected.

## Verification

Tests cover unit conversion, retest grouping, cherished-transfer identity changes, drop segmentation,
outliers, sparse histories, horizon limits, replay, contract parity, and observed holdout coverage.
