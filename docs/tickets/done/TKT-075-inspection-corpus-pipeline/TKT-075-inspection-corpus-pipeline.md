---
id: TKT-075
title: Build the reproducible inspection-address corpus pipeline
status: done
priority: P1
area: platform
tickets-it-relates-to: [TKT-062, TKT-076, TKT-080, TKT-074]
research-link: docs/tickets/done/TKT-075-inspection-corpus-pipeline/evidence/operator-note.md
---

# Build the reproducible inspection-address corpus pipeline

## Problem

Inspection-address suggestions need deterministic provider attribution, postcode normalization,
deduplication, optional geocoding and a safe seed path. Staff must still select or edit a full address;
the EVA `Loc` value is never used as a runtime input.

## Current implementation

- `scripts/evaluation/inspection-corpus/build_corpus.py` resolves the source workbook by evidence-catalog identity,
  parses provider markers, normalizes postcodes, removes non-site rows and writes a PII-free seed CSV.
- `scripts/evaluation/inspection-corpus/geocode_sites.py` adds cached postcode centroids as a separate reproducible
  step.
- `database/seeds/data/inspection-suggestions.csv` is the reviewed seed output.
- `database/baseline/040_inspection_address.sql` and the dated migration carry provider and coordinate
  fields.
- `database/seeds/920_replace_suggested_addresses.sql` replaces suggested rows idempotently while
  preserving confirmed rows.

## Acceptance

- Identical source bytes produce identical ordered output and report hashes.
- Provider markers map to the correct provider; malformed and registration-shaped identifiers do not
  create providers.
- Equivalent postcodes deduplicate, site names are preserved, and non-site/image-only rows are excluded.
- Seed output contains no claimant, registration, claim-number or contact fields.
- Geocoding records both resolved and unresolved postcodes without changing the pure parse result.
- Baseline, migration and seed pass scratch-database replay and confirmed-row preservation checks.
- Source workbook bytes remain unchanged and resolve through the global evidence catalog.

## Artifacts

- [Changes](./changes.md)
- [Verification](./verification.md)
- [Operator analysis](./evidence/operator-note.md)
