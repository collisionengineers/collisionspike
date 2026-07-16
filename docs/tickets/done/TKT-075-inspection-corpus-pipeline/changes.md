# Changes — TKT-075

## Status

Implemented and verified offline. TKT-080 owns the separately authorized live seed application.

## Files

- `scripts/evaluation/inspection-corpus/{build_corpus.py,geocode_sites.py,README.md}`
- `database/seeds/data/inspection-suggestions.csv`
- `database/baseline/040_inspection_address.sql`
- `database/migrations/2026-07-06-inspection-address-provider-geo.sql`
- `database/seeds/920_replace_suggested_addresses.sql`
- `tests/fixtures/manifests/evidence.json` for the immutable source-workbook use

The source workbook is stored once by SHA-256. The catalog retains its original filename and pipeline
ownership; the resolver supplies the exact bytes without restoring a duplicate documentation copy.
