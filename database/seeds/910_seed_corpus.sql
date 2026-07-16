-- =============================================================================
-- 910_seed_corpus.sql  --  Corpus reseed (work_provider, repairer, inspection_address, image_source)
-- Idempotent staging-table + \copy + upsert pattern per corpus (plan §20.4, seed/README.md).
-- Apply AFTER 900_constraints.sql so natural-key UNIQUE constraints and FKs exist.
--
-- This file reseeds the reference corpus ONLY — NOT live case data. Every source
-- CSV is committed beside this script under database/seeds/data.
-- Each corpus is loaded into a staging table, then upserted keyed on its natural key.
--
-- DEPENDENCY ORDER (upsert-safe):
--   1. work_provider (principal_code)
--   2. repairer (name, postcode)
--   3. inspection_address confirmed sites (label)
--   4. image_source (name)
--   5. repairer_workprovider links
--   6. imagesource_workprovider links
-- Suggested addresses are replaced separately by 920_replace_suggested_addresses.sql.
--
-- NOTE: \copy is client-side (psql -f FILE); it reads paths relative to the
-- client's working directory, NOT the server's file system.
-- =============================================================================

BEGIN;

-- =============================================================================
-- HELPER: Postcode normalizer (collapse spaces, uppercase)
-- =============================================================================
CREATE OR REPLACE FUNCTION normalize_postcode(pc varchar) RETURNS varchar AS $$
  SELECT
    CASE
      WHEN pc IS NULL OR btrim(pc) = '' THEN ''
      ELSE
        CASE
          WHEN length(btrim(regexp_replace(btrim(pc), '\s+', '', 'g'))) BETWEEN 5 AND 7 THEN
            upper(btrim(substring(regexp_replace(btrim(pc), '\s+', '', 'g'), 1, length(regexp_replace(btrim(pc), '\s+', '', 'g')) - 3))
            || ' ' ||
            substring(regexp_replace(btrim(pc), '\s+', '', 'g'), length(regexp_replace(btrim(pc), '\s+', '', 'g')) - 2))
          ELSE upper(btrim(pc))
        END
    END
$$ LANGUAGE sql IMMUTABLE;

-- =============================================================================
-- LOAD ALL STAGING TABLES UP FRONT (before any upserts)
-- =============================================================================

-- 1. Work provider corpus (provider_corpus_recommendation.csv)
-- Header (10 cols; UTF-8 BOM stripped on first col):
--   principal_code,resolved_name,contact_group,on_job_sheet,total_cases,
--   last_used,recency_band,inspection_modality,loc_rate_pct,recommended_action
CREATE UNLOGGED TABLE _stg_work_provider (
  principal_code text,
  resolved_name text,
  contact_group text,
  on_job_sheet text,
  total_cases text,
  last_used text,
  recency_band text,
  inspection_modality text,
  loc_rate_pct text,
  recommended_action text
);

\copy _stg_work_provider FROM 'database/seeds/data/provider-corpus.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')

-- 3. Yards (top_inspection_locations.csv)
-- Header (7 cols; UTF-8 BOM stripped on first col):
--   full_postcode,total_cases,distinct_principals,dominant_principal,
--   dominant_principal_name,dominant_principal_cases,known_repairer_at_pc
CREATE UNLOGGED TABLE _stg_yards (
  full_postcode text,
  total_cases text,
  distinct_principals text,
  dominant_principal text,
  dominant_principal_name text,
  dominant_principal_cases text,
  known_repairer_at_pc text
);

\copy _stg_yards FROM 'database/seeds/data/inspection-yards.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')

-- 4. Garage matches (task1_garages_vs_repairer/matches.csv)
-- Header (10 cols; UTF-8 BOM stripped on first col):
--   garage_name,garage_postcode,garage_email,garage_phone,repairer_code,
--   repairer_name,repairer_postcode,name_jaccard,pc_full_match,pc_outward_match
-- (name_jaccard staged as text; upsert casts it ::numeric)
CREATE UNLOGGED TABLE _stg_garage_matches (
  garage_name text,
  garage_postcode text,
  garage_email text,
  garage_phone text,
  repairer_code text,
  repairer_name text,
  repairer_postcode text,
  name_jaccard text,
  pc_full_match text,
  pc_outward_match text
);

\copy _stg_garage_matches FROM 'database/seeds/data/repairer-matches.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')

-- 5. Confirmed inspection sites (full_postcodes_repeated.csv)
-- Header (4 cols; UTF-8 BOM stripped on first col):
--   principal_code,resolved_name,full_postcode,count
-- (count staged as text; upsert casts it ::int)
CREATE UNLOGGED TABLE _stg_confirmed_sites (
  principal_code text,
  resolved_name text,
  full_postcode text,
  count text
);

\copy _stg_confirmed_sites FROM 'database/seeds/data/confirmed-inspection-postcodes.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')

-- =============================================================================
-- 1. UPSERT work_provider
-- =============================================================================

INSERT INTO work_provider
  (principal_code, display_name, active, inspection_location_policy_code, provider_automation_mode_code)
SELECT
  wp.principal_code,
  CASE
    WHEN wp.resolved_name ~* '(^FAO The Court|^FAO. The Court|^FOA The Court|^FAO The Client|^\.$|^Flat$)' THEN wp.principal_code || ' (name pending)'
    ELSE wp.resolved_name
  END AS display_name,
  CASE
    WHEN wp.recommended_action LIKE 'SEED active%' THEN true
    WHEN wp.recommended_action LIKE 'ARCHIVE%' THEN false
    WHEN wp.recommended_action LIKE 'CONSIDER%' THEN true
    ELSE NULL
  END AS active,
  CASE
    WHEN wp.inspection_modality = 'image-based' THEN 100000000
    ELSE 100000001
  END AS inspection_location_policy_code,
  -- provider_automation_mode_code = 100000001 (review_auto).
  -- RECONCILIATION (work-todo-spike: automation-mode): the 3-mode enum is manual |
  -- review_auto | full_auto. The schema column default is review_auto (010_work_provider.sql)
  -- and review_auto is the documented live default AND exactly the path the orchestrator runs
  -- today (auto-prepare, human review before EVA). Seeding 'manual' here would, once the
  -- (gated-OFF) automation-mode branching is enabled, STOP the existing corpus auto-processing —
  -- a regression. So seeded providers default to review_auto to match the schema default and
  -- current live behaviour; full_auto stays reserved/deferred. The ON CONFLICT below does NOT
  -- touch provider_automation_mode_code, so a live Superuser edit survives a reseed.
  100000001 AS provider_automation_mode_code
FROM _stg_work_provider wp
WHERE
  wp.principal_code IS NOT NULL AND wp.principal_code != ''
  AND length(btrim(wp.principal_code)) <= 8   -- skip ~39 malformed >8-char source codes (principal_code is varchar(8))
  AND wp.recommended_action NOT LIKE 'EXCLUDE%'
  AND wp.recommended_action NOT LIKE 'REVIEW%'
ON CONFLICT (principal_code) DO UPDATE SET
  display_name = excluded.display_name,
  active = excluded.active,
  inspection_location_policy_code = excluded.inspection_location_policy_code,
  updated_at = now();

-- =============================================================================
-- 2. UPSERT repairer (from yards + garage matches)
-- =============================================================================

-- From yards
INSERT INTO repairer (name, address_line1, postcode, active)
SELECT DISTINCT
  y.known_repairer_at_pc,
  y.known_repairer_at_pc,
  normalize_postcode(y.full_postcode),
  true
FROM _stg_yards y
WHERE
  y.known_repairer_at_pc IS NOT NULL AND y.known_repairer_at_pc != ''
  AND y.full_postcode IS NOT NULL AND y.full_postcode != ''
  AND y.full_postcode ~ '^[A-Z]{1,2}[0-9R][0-9A-Z]?\s*[0-9][ABD-HJLNP-UW-Z]{2}$'
ON CONFLICT (name, postcode) DO UPDATE SET
  address_line1 = excluded.address_line1,
  active = excluded.active,
  updated_at = now();

-- From garage matches (only confirmed: pc_full_match=True OR (pc_outward_match=True AND name_jaccard>=0.5))
INSERT INTO repairer (name, postcode, email, phone, active)
SELECT
  gm.repairer_name,
  normalize_postcode(COALESCE(NULLIF(btrim(gm.repairer_postcode), ''), gm.garage_postcode)),
  NULLIF(btrim(gm.garage_email), ''),
  NULLIF(btrim(regexp_replace(gm.garage_phone, '\s*\(.*?\)\s*', '', 'g')), ''),
  true
FROM _stg_garage_matches gm
WHERE
  gm.repairer_name IS NOT NULL AND gm.repairer_name != ''
  AND (COALESCE(NULLIF(btrim(gm.repairer_postcode), ''), gm.garage_postcode) IS NOT NULL
       AND COALESCE(NULLIF(btrim(gm.repairer_postcode), ''), gm.garage_postcode) != '')
  AND (
    gm.pc_full_match = 'True'
    OR (gm.pc_outward_match = 'True' AND COALESCE((gm.name_jaccard)::numeric, 0) >= 0.5)
  )
ON CONFLICT (name, postcode) DO UPDATE SET
  email = excluded.email,
  phone = excluded.phone,
  active = excluded.active,
  updated_at = now();

-- =============================================================================
-- 3. UPSERT inspection_address (CONFIRMED SITES)
-- =============================================================================

INSERT INTO inspection_address
  (label, decision_mode_code, source_label, postcode, created_at, updated_at)
SELECT
  cs.principal_code || ' -- ' || normalize_postcode(cs.full_postcode) AS label,
  100000000 AS decision_mode_code,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM _stg_yards y
      WHERE normalize_postcode(y.full_postcode) = normalize_postcode(cs.full_postcode)
        AND y.known_repairer_at_pc IS NOT NULL
    ) THEN 'storage'
    WHEN EXISTS (
      SELECT 1 FROM repairer r
      WHERE r.postcode = normalize_postcode(cs.full_postcode)
    ) THEN 'repairer'
    ELSE ''
  END AS source_label,
  normalize_postcode(cs.full_postcode),
  now(),
  now()
FROM _stg_confirmed_sites cs
WHERE
  cs.principal_code IS NOT NULL AND cs.principal_code != ''
  AND cs.full_postcode IS NOT NULL AND cs.full_postcode != ''
  AND cs.full_postcode ~ '^[A-Z]{1,2}[0-9R][0-9A-Z]?\s*[0-9][ABD-HJLNP-UW-Z]{2}$'
  AND nullif(btrim(cs.count), '')::int >= 3
  AND NOT EXISTS (
    SELECT 1 FROM _stg_work_provider wp
    WHERE wp.principal_code = cs.principal_code
      AND (wp.recommended_action LIKE 'EXCLUDE%' OR wp.recommended_action LIKE 'REVIEW%')
  )
  AND NOT (cs.resolved_name ~ '(^FAO The Court|^FAO. The Court|^FOA The Court|^FAO The Client|^\.$|^Flat$)' AND nullif(btrim(cs.count), '')::int < 5)
ON CONFLICT (label) DO UPDATE SET
  source_label = excluded.source_label,
  updated_at = now();

-- =============================================================================
-- 4. INSERT image_source (one per yard; kind_code = 100000001 = repairer)
-- Idempotent by (name, kind_code) using WHERE NOT EXISTS
-- =============================================================================

INSERT INTO image_source (name, kind_code, created_at, updated_at)
SELECT DISTINCT
  y.known_repairer_at_pc,
  100000001,
  now(),
  now()
FROM _stg_yards y
WHERE
  y.known_repairer_at_pc IS NOT NULL AND y.known_repairer_at_pc != ''
  AND y.full_postcode IS NOT NULL AND y.full_postcode != ''
  AND y.full_postcode ~ '^[A-Z]{1,2}[0-9R][0-9A-Z]?\s*[0-9][ABD-HJLNP-UW-Z]{2}$'
  AND NOT EXISTS (
    SELECT 1 FROM image_source img
    WHERE img.name = y.known_repairer_at_pc AND img.kind_code = 100000001
  );

-- =============================================================================
-- 5. LINK: repairer_workprovider (all repairers to all active providers)
-- Conservative approach: link all yards to all providers
-- =============================================================================

INSERT INTO repairer_workprovider (repairer_id, work_provider_id)
SELECT DISTINCT r.id, wp.id
FROM repairer r
CROSS JOIN work_provider wp
WHERE r.active = true AND wp.active = true
ON CONFLICT (repairer_id, work_provider_id) DO NOTHING;

-- =============================================================================
-- 6. LINK: imagesource_workprovider (all image sources to all active providers)
-- =============================================================================

INSERT INTO imagesource_workprovider (image_source_id, work_provider_id)
SELECT DISTINCT img.id, wp.id
FROM image_source img
CROSS JOIN work_provider wp
WHERE img.kind_code = 100000001
  AND wp.active = true
ON CONFLICT (image_source_id, work_provider_id) DO NOTHING;

-- =============================================================================
-- 8. LINK FOREIGN KEYS
-- =============================================================================

-- Update repairer IDs on inspection_address (match by postcode)
UPDATE inspection_address ia
SET repairer_id = (
  SELECT r.id FROM repairer r
  WHERE r.postcode = ia.postcode
  LIMIT 1
)
WHERE ia.postcode IS NOT NULL
  AND ia.source_label IN ('repairer', 'storage', '')
  AND ia.repairer_id IS NULL;

-- Update repairer_id on image_source (match by name)
UPDATE image_source img
SET repairer_id = (
  SELECT r.id FROM repairer r
  WHERE r.name = img.name
  LIMIT 1
)
WHERE img.kind_code = 100000001
  AND img.name IS NOT NULL
  AND img.repairer_id IS NULL;

-- Link image sources to default inspection addresses (by postcode)
UPDATE image_source img
SET default_inspection_address_id = (
  SELECT ia.id FROM inspection_address ia
  WHERE ia.postcode = (
    SELECT r.postcode FROM repairer r WHERE r.id = img.repairer_id
  )
  AND ia.source_label IN ('repairer', 'storage', '')
  LIMIT 1
)
WHERE img.kind_code = 100000001
  AND img.repairer_id IS NOT NULL
  AND img.default_inspection_address_id IS NULL;

-- =============================================================================
-- CLEANUP
-- =============================================================================

DROP TABLE IF EXISTS _stg_work_provider;
DROP TABLE IF EXISTS _stg_yards;
DROP TABLE IF EXISTS _stg_garage_matches;
DROP TABLE IF EXISTS _stg_confirmed_sites;
DROP FUNCTION IF EXISTS normalize_postcode(varchar);

COMMIT;
