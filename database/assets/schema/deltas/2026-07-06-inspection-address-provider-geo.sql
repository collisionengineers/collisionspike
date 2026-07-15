-- =============================================================================
-- 2026-07-06-inspection-address-provider-geo.sql
-- Inspection-address: provider scoping + geocode columns (TKT-075/076) -- idempotent
-- -----------------------------------------------------------------------------
-- PURPOSE. The suggestions corpus is being rebuilt in-repo (scripts/inspection-corpus/)
-- with a marker-aware provider parse and offline geocodes. This delta adds the three
-- columns the corrected corpus + the Data API scoping/proximity work need:
--   * provider_code varchar(16) -- real work-provider code per suggested row, so the API
--       can scope the shortlist server-side (today every case sees the same global top-8
--       because the seed never wrote a provider and the API keeps no-provider rows).
--   * latitude / longitude double precision -- offline site centroid for distance-blended
--       ORDERING only (ADR-0016 #2b; never auto-selects, never an intake input, ADR-0013).
--
-- SHIPS SAFE: additive nullable columns change nothing until the 920 replace seed writes
-- them and the API code that reads provider_code deploys. Column-present but data-absent is
-- an honest no-op (the API falls back to the legacy source_note/label token).
--
-- IDEMPOTENT + ADDITIVE + TRANSACTIONAL: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT
-- EXISTS; one BEGIN..COMMIT; safe to re-run. A fresh rebuild that already applied the
-- companion canonical file (../040_inspection_address.sql) no-ops here. See ./README.md.
-- =============================================================================
BEGIN;

ALTER TABLE inspection_address ADD COLUMN IF NOT EXISTS provider_code varchar(16);
ALTER TABLE inspection_address ADD COLUMN IF NOT EXISTS latitude      double precision;
ALTER TABLE inspection_address ADD COLUMN IF NOT EXISTS longitude     double precision;

COMMENT ON COLUMN inspection_address.provider_code IS
  'ADR-0016 work-provider code (marker-aware parse) for a suggested catalogue row; NULL on a Case. Drives server-side shortlist scoping (TKT-076).';
COMMENT ON COLUMN inspection_address.latitude IS
  'Offline site centroid latitude (postcodes.io); ORDERING-only proximity signal (ADR-0016 #2b) -- never auto-selects.';

CREATE INDEX IF NOT EXISTS ix_inspection_address_provider ON inspection_address (provider_code)
  WHERE source_label LIKE 'suggested%';

COMMIT;
