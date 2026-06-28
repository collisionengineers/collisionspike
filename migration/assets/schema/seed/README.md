# Corpus reseed (Postgres) — NOT a live-row copy

There is **no production case data** to migrate (hard cutover, project not live as a service).
The only thing that must land in the new database is the **reference corpus**, reseeded from the
**same offline seed sources** the Power-Platform build used under `dataverse/.build/` — never by
exporting live `cr1bd_*` rows. (The single Dataverse row export is the cold-archive CSV taken at
teardown — see [`90-deprovision-power-platform.md`](../../../../docs/HISTORICAL/migration/90-deprovision-power-platform.md).)

## Source → table map (real files in the repo)

| New table | Source file(s) under `dataverse/.build/` | Old loader (logic to port) | Rows (approx) |
|---|---|---|---|
| `work_provider` | `sources/…provider_corpus_recommendation.csv` (via `_corpus-common.ps1`) + `email-domains.csv` (principal_code,email_domain) for `known_email_domains` | `10-seed-workprovider.ps1`, `15-seed-emaildomains.ps1` | ~392 |
| `repairer` | `…/claudeschoice/top_inspection_locations.csv` + `…/task1_garages_vs_repairer/matches.csv` | `11-seed-repairers.ps1` | ~61 |
| `inspection_address` (confirmed) | confirmed sites (repairer/storage/home) | `12-seed-inspection-sites.ps1` | small |
| `inspection_address` (suggested) | `sources/inspection-suggestions-from-eva-export.csv` (2,035 data rows; `rank,frequency,last_seen` already computed by `preprocess-eva-inspection-export.py`) | `16-seed-suggested-addresses.ps1` | ~871 deduped sites |
| `image_source` (+ `imagesource_workprovider`) | image-source links | `13-link-imagesources.ps1` | ~23 |
| `repairer_workprovider` | `matches.csv` provider↔repairer pairs | `11`/`13` link steps | — |

The CSV column headers are stable (e.g. the suggestions CSV is
`provider_code,loc_value,address_index_for_loc,full_address,address_postcode,address_status,evidence_source,evidence_detail,frequency,last_seen,rank,case_key_kind`).

## Reseed pattern (staging table + `\copy` + idempotent upsert)

Reseed is a **port of the PowerShell upsert logic to SQL**, not a byte copy. For each corpus, load
the CSV into an UNLOGGED staging table with `\copy` (client-side; no server file access needed),
then `INSERT … ON CONFLICT … DO UPDATE` into the real table keyed on its **natural key**
(`work_provider.principal_code`, `repairer (name, postcode)`, `inspection_address.label`). This makes
the reseed **re-runnable** (the same property the `16-seed-*.ps1` re-run needs against the
continuously-changing suggestions source).

```sql
-- example: suggested inspection addresses (mirrors 16-seed-suggested-addresses.ps1)
CREATE UNLOGGED TABLE _stg_suggestions (
  provider_code text, loc_value text, address_index_for_loc int, full_address text,
  address_postcode text, address_status text, evidence_source text, evidence_detail text,
  frequency int, last_seen date, rank int, case_key_kind text
);
\copy _stg_suggestions FROM 'dataverse/.build/sources/inspection-suggestions-from-eva-export.csv' WITH (FORMAT csv, HEADER true)

INSERT INTO inspection_address
  (label, decision_mode_code, source_label, address_line1, postcode,
   suggestion_frequency, last_seen_on, suggestion_rank)
SELECT
  -- the loader's deterministic label (provider + site); keep it unique across confirmed+suggested
  s.provider_code || ' · ' || s.full_address                AS label,
  100000003                                                  AS decision_mode_code,  -- unknown (never auto-confirmed)
  'suggested:' || s.address_status                           AS source_label,
  s.full_address                                             AS address_line1,
  nullif(s.address_postcode,'')                              AS postcode,
  s.frequency, s.last_seen, s.rank
FROM _stg_suggestions s
ON CONFLICT (label) DO UPDATE SET
  source_label         = excluded.source_label,
  suggestion_frequency = excluded.suggestion_frequency,
  last_seen_on         = excluded.last_seen_on,
  suggestion_rank      = excluded.suggestion_rank;

DROP TABLE _stg_suggestions;
```

The exact `label` derivation, the confirmed-vs-suggested split, and the provider/repairer link
inserts come straight from the corresponding `.build/*.ps1`. Author one `seed_<corpus>.sql` per row
in the table above (or a single `910_seed_corpus.sql` running them in dependency order:
`work_provider` → `repairer` → `image_source`/`inspection_address` → junctions). Apply **after**
`900_constraints.sql` so the natural-key UNIQUE constraints and FKs are already in place.

## Choice-table integers are seeded by `000_enums_lookups.sql`

The `choice_*` lookup rows are reference data and ship **inside the DDL** (`000_…`), not here — so the
corpus reseed only ever inserts business rows whose `*_code` columns already resolve.
