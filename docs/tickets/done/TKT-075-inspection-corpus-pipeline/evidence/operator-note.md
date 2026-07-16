# Inspection-address corpus source analysis

This note retains the durable findings from the supplied inspection-address workbook. The immutable
workbook occurrence is recorded in `tests/fixtures/manifests/evidence.json`; its bytes are stored once
in the content-addressed evidence store and resolved by catalog identity.

## Source findings

- Provider attribution cannot use the leading alphabetic part of a Case/PO. Prefix markers such as
  `a.` and `ap.` must be removed before the provider segment is interpreted.
- Postcodes must be normalized before deduplication so spacing variants do not create separate sites.
- Site names and name-plus-postcode rows are useful address evidence and must not be discarded merely
  because a street line is absent.
- Image-based rows and malformed identifiers are not physical sites. Their detection is tolerant of
  spelling variation and registration-shaped identifiers.
- The workbook is an offline corpus source only. Its `Loc` export value is never a runtime address
  lookup input, and staff still select or edit the resulting full address.

## Current disposition

- `scripts/evaluation/inspection-corpus/build_corpus.py` performs deterministic parsing and writes the
  PII-free reviewed seed at `database/seeds/data/inspection-suggestions.csv`.
- `scripts/evaluation/inspection-corpus/geocode_sites.py` is a separate cached enrichment step, so
  network results cannot change the pure parse result.
- `database/seeds/920_replace_suggested_addresses.sql` replaces suggestion rows idempotently while
  preserving staff-confirmed rows.
- Provider scoping, ranking, photo-based assistance and any live seed application remain owned by
  their separate tickets; this ticket does not authorize a live write.
