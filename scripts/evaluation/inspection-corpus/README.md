# Inspection-address corpus pipeline

This deterministic pipeline rebuilds the provider-scoped inspection-address suggestions used by the
database seed. ADR-0013 and ADR-0016 govern the selection, deduplication, ranking, and operator decision
boundaries.

## Inputs and outputs

- The full-address workbook is resolved by its catalogued original identity from the
  [evidence manifest](../../../tests/fixtures/manifests/evidence.json).
- `reports/postcode-geocache.json` is a pinned input that makes geocoding reproducible offline.
- `database/seeds/data/inspection-suggestions.csv` is the current PII-free database seed.
- The per-provider diagnostic report is reproducible output written under `.artifacts/` and is not
  tracked.

The workbook contains personal data. The emitted seed and aggregate report contain provider codes,
addresses, postcodes, and aggregate counts only; they exclude names, registrations, claim references,
and inspection contacts.

## Run

```powershell
python scripts/evaluation/inspection-corpus/build_corpus.py
python scripts/evaluation/inspection-corpus/geocode_sites.py --offline
```

`build_corpus.py` clears latitude and longitude before rebuilding the seed, so always run the offline
geocode step afterward. Refreshing a missing postcode over the network is an explicit maintenance task:

```powershell
python scripts/evaluation/inspection-corpus/geocode_sites.py
```

The pipeline never decides `always_image_based`; its aggregate report is evidence for a separate staff
decision. Applying the seed to a database is also a separate, explicitly authorized operation.
