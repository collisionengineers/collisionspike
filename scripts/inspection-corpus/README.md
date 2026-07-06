# scripts/inspection-corpus/ — reproducible inspection-address corpus pipeline (TKT-075)

The in-repo, reproducible replacement for the retired `dataverse/.build` preprocessor. Rebuilds the
**suggested** inspection-address catalogue from the EVA full-address export, correctly attributing
provider codes and geocoding sites, and emits a **PII-free** seed CSV consumed by
[`migration/assets/schema/seed/920_replace_suggested_addresses.sql`](../../migration/assets/schema/seed/920_replace_suggested_addresses.sql).

Governed by **ADR-0013** (suggestion + ordering only; no runtime matcher; human always confirms) and
**ADR-0016** (full-replace backup-first; provider from Case-ID; dedup on full address; provider
`always_image_based` is operator-designated, never stats-derived).

## Run order

```bash
# 1. Build the PII-free corpus CSV + per-provider run report from the EVA export.
python scripts/inspection-corpus/build_corpus.py
# 2. Geocode the postcodes -> lat/lon (offline-reproducible via the committed cache).
python scripts/inspection-corpus/geocode_sites.py            # network (refreshes cache on a miss)
python scripts/inspection-corpus/geocode_sites.py --offline  # cache-only (CI/verify; deterministic)
```

`build_corpus.py` **blanks** lat/lon (they aren't in the export), so always run `geocode_sites.py`
**after** it. `build → geocode(--offline)` is deterministic — the CSV hash is stable across runs (a
verification requirement).

## What it does

- **Source:** `docs/reference/fullevaexportinspectionaddresses.xlsx` (git-tracked; ~17,737 EVA
  inspection rows; columns `Case ID, Vehicle Reg, Insured Name, Claim No, Created Date, InspLocAdd,
  InspLocPCode, InspLocName, InspLocCont, InspLocAdd1`). Read with stdlib `zipfile`+`xml.etree` — no deps.
- **Provider parse (marker-aware):** strip a leading `a.` / `ap.` / `d.` marker, then take the leading
  alpha of the Case ID, uppercased. `a.qdos25448` → `QDOS`, `qdos24731` → `QDOS`, `fw24126` → `FW`. This
  is the core fix: the old parse mis-attributed the ~4,673 `a.`/`ap.`-marked rows (e.g. `a.qdos…`→`A`).
- **Exclusions:** VRM-shaped Case IDs (individual/private claimant — no provider code); rows whose
  `InspLocName`/address carry the "Image Based Assessment" marker (typo/hyphen-tolerant:
  `Image-based`, `Imagebased`, `Asessment`, `bassed`, …); rows with no locatable site. **Kept:**
  name+postcode-only sites.
- **Dedup + rank:** deterministic UK-postcode normalisation, then dedup per (provider, full site);
  recompute frequency / last-seen / rank **per provider**.
- **Outputs:**
  - `migration/assets/schema/seed/data/inspection-suggestions.csv` — the PII-free seed
    (`provider_code, label, address_line1, address_line2, postcode, latitude, longitude,
    suggestion_frequency, last_seen_on, suggestion_rank`). ~2,012 sites across ~80 providers.
    `label` is unique (postcode-disambiguated) — it is the reseed's `UNIQUE(label)` upsert key.
  - `scripts/inspection-corpus/reports/provider-report.csv` — per-provider `total_cases`,
    `image_based`, `image_based_pct`, `dropped_no_site`, `unique_sites`. This is the **operator's
    input for designating `always_image_based`** (e.g. QDOS 99.9%, PCH 99.6%, AX 99.2%, SBL 99.5%,
    ALS 95.8%). The pipeline **never sets policy** (ADR-0016 helper #1).
  - `scripts/inspection-corpus/reports/postcode-geocache.json` — committed postcode→lat/lon cache,
    so geocoding is offline-reproducible and pinned.

## PII stance

The **source xlsx contains PII** (insured names, VRMs, claim numbers) and is git-tracked (accepted as-is
per the operator decision). Every pipeline **output is PII-free**: only provider code, site name/street,
postcode, and aggregate stats — no name, reg, claim number, or inspection contact. Verify with a grep
sweep for VRM-shaped tokens / claim numbers over the CSV (0 expected).

## Applying the reseed

Live apply is **operator-gated** and executed in Phase F (TKT-080) — see the seed header +
[`docs/architecture/inspection-address-corpus.md`](../../docs/architecture/inspection-address-corpus.md).
It is backup-first and replaces only `source_label LIKE 'suggested%'`, preserving Confirmed rows.
