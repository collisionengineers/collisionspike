# Changes — TKT-075: Rebuild the inspection-address corpus in-repo — correct provider attribution + geocodes

## Status
DONE (2026-07-06) — reproducible pipeline + corrected corpus + DDL + reseed built and validated
against live (dry-run, rolled back). The live reseed itself is TKT-080.

## What was built
- **`scripts/inspection-corpus/build_corpus.py`** — stdlib (zipfile+xml.etree) reader of
  `docs/reference/fullevaexportinspectionaddresses.xlsx`. Marker-aware provider parse
  (`a.qdos…`/`ap.qdos…`/`d.…` → QDOS/…), VRM-shaped-ID exclusion, typo/hyphen-tolerant
  image-based drop, UK-postcode normalisation, dedup per (provider, full site), per-provider
  frequency/last-seen/rank. Emits a **PII-free** CSV + a per-provider run report.
- **`scripts/inspection-corpus/geocode_sites.py`** — postcodes.io bulk geocode → lat/lon, pinned in a
  committed cache (`reports/postcode-geocache.json`) for offline-reproducible, deterministic runs.
- **`scripts/inspection-corpus/README.md`** — run order, rules, PII stance.
- **Outputs (committed):**
  - `migration/assets/schema/seed/data/inspection-suggestions.csv` — 2,012 sites / 80 providers,
    unique `label`, provider_code + lat/lon, PII-free.
  - `scripts/inspection-corpus/reports/provider-report.csv` — operator input for `always_image_based`.
  - `scripts/inspection-corpus/reports/postcode-geocache.json` — 1,388 postcode centroids.
- **DDL:** `migration/assets/schema/040_inspection_address.sql` gains `provider_code`, `latitude`,
  `longitude` + a provider index (fresh-rebuild truth); idempotent live delta
  `migration/assets/schema/deltas/2026-07-06-inspection-address-provider-geo.sql`
  (`ADD COLUMN IF NOT EXISTS`).
- **Reseed:** `migration/assets/schema/seed/920_replace_suggested_addresses.sql` — backup-first,
  replaces only `source_label LIKE 'suggested%'`, writes provider_code + lat/lon + a `provider=<CODE>`
  `source_note`, preserves Confirmed rows.

## Key correction vs the old corpus
The old live corpus was built from a naive Case-ID parse that scattered the ~4,673 `a.`/`ap.`-marked
rows (QDOS/PCH were absent from the provider list). The rebuilt corpus attributes them correctly and,
critically, the run report reveals QDOS 99.9% / PCH 99.6% / AX 99.2% / SBL 99.5% / ALS 95.8%
image-based — i.e. these are near-pure image-based providers (1–4 physical sites), which the operator
can now designate `always_image_based` from real numbers.

## Files
- `scripts/inspection-corpus/{build_corpus.py,geocode_sites.py,README.md}` (+ `reports/*`)
- `migration/assets/schema/040_inspection_address.sql`
- `migration/assets/schema/deltas/2026-07-06-inspection-address-provider-geo.sql`
- `migration/assets/schema/seed/920_replace_suggested_addresses.sql`
- `migration/assets/schema/seed/data/inspection-suggestions.csv`
