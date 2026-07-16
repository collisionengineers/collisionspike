-- =============================================================================
-- 920_replace_suggested_addresses.sql
-- Replace the inspection-address SUGGESTED layer from the rebuilt corpus (TKT-075/080).
-- -----------------------------------------------------------------------------
-- Replaces ONLY the suggested catalogue rows (source_label LIKE 'suggested%') with the
-- corrected, geocoded corpus emitted by scripts/evaluation/inspection-corpus/build_corpus.py +
-- geocode_sites.py. Hand-curated Confirmed rows (any non-'suggested%' row) are PRESERVED
-- untouched (ADR-0016 full-replace, backup-first; ADR-0013 suggestion+ordering only).
--
-- BACKUP-FIRST + IDEMPOTENT: a backup table of the pre-reseed suggested rows is created on
-- first run (kept for rollback); staging is DROP/CREATE; the replace is one BEGIN..COMMIT so
-- a failed insert rolls the delete back. Safe to re-run (converges to the same state).
--
-- REQUIRES a psql variable for the corpus CSV path, e.g.:
--   psql "<conn>" -v csvpath='/abs/path/database/seeds/data/inspection-suggestions.csv' \
--        -f database/seeds/920_replace_suggested_addresses.sql
-- Run as the database owner/administrative role described in the operations guide.
-- decision_mode_code 100000003 = 'unknown' (suggested); source_note carries a `provider=<CODE>`
-- token the Data API mapper already parses.
-- =============================================================================
\set ON_ERROR_STOP on

-- 1. Backup the current suggested rows (first run only; the pre-reseed snapshot for rollback).
CREATE TABLE IF NOT EXISTS inspection_address_reseed_backup_2026_07_06 AS
  SELECT * FROM inspection_address WHERE source_label LIKE 'suggested%';

-- 2. Stage the rebuilt corpus CSV (column order MUST match the CSV header).
DROP TABLE IF EXISTS _stg_inspection_suggestions;
CREATE TEMP TABLE _stg_inspection_suggestions (
  provider_code        varchar(16),
  label                varchar(200),
  address_line1        varchar(200),
  address_line2        varchar(200),
  postcode             varchar(16),
  latitude             double precision,
  longitude            double precision,
  suggestion_frequency integer,
  last_seen_on         date,
  suggestion_rank      integer
);
\copy _stg_inspection_suggestions FROM :'csvpath' WITH (FORMAT csv, HEADER true)

BEGIN;

-- 3. Replace ONLY the suggested layer; PRESERVE Confirmed/hand-curated rows.
DELETE FROM inspection_address WHERE source_label LIKE 'suggested%';

-- 4. Insert the corrected corpus. ON CONFLICT (label) DO NOTHING protects any preserved
--    Confirmed row that happens to share a label (Confirmed always outranks a suggestion).
INSERT INTO inspection_address (
  label, decision_mode_code, source_label, source_note, provider_code,
  address_line1, address_line2, postcode, latitude, longitude,
  suggestion_frequency, last_seen_on, suggestion_rank
)
SELECT
  label,
  100000003,
  'suggested:eva_export',
  'provider=' || provider_code,
  provider_code,
  NULLIF(btrim(address_line1), ''),
  NULLIF(btrim(address_line2), ''),
  NULLIF(btrim(postcode), ''),
  latitude,
  longitude,
  suggestion_frequency,
  last_seen_on,
  suggestion_rank
FROM _stg_inspection_suggestions
ON CONFLICT (label) DO NOTHING;

COMMIT;

-- 5. Post-reseed report.
\echo '== post-reseed counts =='
SELECT 'suggested (replaced)' AS bucket, count(*) AS n FROM inspection_address WHERE source_label LIKE 'suggested%'
UNION ALL SELECT 'confirmed/other (preserved)', count(*) FROM inspection_address WHERE source_label IS NULL OR source_label NOT LIKE 'suggested%'
UNION ALL SELECT 'suggested with provider_code', count(*) FROM inspection_address WHERE source_label LIKE 'suggested%' AND provider_code IS NOT NULL
UNION ALL SELECT 'suggested with lat/lon', count(*) FROM inspection_address WHERE source_label LIKE 'suggested%' AND latitude IS NOT NULL;

\echo '== top providers after reseed =='
SELECT provider_code, count(*) AS sites FROM inspection_address
WHERE source_label LIKE 'suggested%' GROUP BY provider_code ORDER BY sites DESC LIMIT 12;
