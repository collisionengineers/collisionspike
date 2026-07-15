# Verification — TKT-075

## Verdict

TESTED (offline). The accepted scope is the reproducible pipeline and scratch-database behavior; TKT-080
records the live seed operation.

## Evidence

- Two pure build runs from the catalog-resolved workbook produce the same CSV hash.
- Parser tests cover provider markers, malformed identifiers, postcode normalization, deduplication,
  site-name retention and non-site removal.
- The output schema contains only provider, address, postcode, coordinates and aggregate source fields;
  automated scans reject claimant, registration, claim and contact columns or values.
- Offline geocoding from the pinned cache is deterministic and records misses.
- The migration plus replacement seed apply twice in a rolled-back scratch transaction and preserve the
  confirmed-row checksum.
- Evidence validation confirms the source workbook's catalog SHA-256 and byte size.

## How to re-verify

Resolve the workbook through the evidence helper, run build and offline geocoding twice, compare hashes,
run the PII scan and pipeline tests, then apply the migration/seed twice to a disposable database and
compare confirmed rows before and after.
