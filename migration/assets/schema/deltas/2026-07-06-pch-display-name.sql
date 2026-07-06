-- =============================================================================
-- 2026-07-06-pch-display-name.sql
-- TKT-065 — correct PCH's work_provider.display_name (idempotent, DATA ONLY)
-- -----------------------------------------------------------------------------
-- PURPOSE. PCH's display_name was seeded as the placeholder "PCH (name pending)"
-- because the corpus source CSV's resolved_name was one of the un-resolvable
-- placeholders the 910 seed CASE maps to `<principal_code> (name pending)`
-- (migration/assets/schema/seed/910_seed_corpus.sql, the display_name CASE). PCH
-- is Performance Car Hire (operator-confirmed 2026-07-06). This corrects the
-- LIVE stored string.
--
-- Reproducibility (mirrors 916_provider_domain_corrections.sql's honesty note):
-- a full 910 reseed derives display_name from the gitignored source CSV
-- (raw/principalandrepairersheets/outputs/reports/provider_corpus_recommendation.csv)
-- via the 910 display_name CASE. To make a reseed reproduce the real name WITHOUT
-- this patch, correct PCH's `resolved_name` to `Performance Car Hire` in that CSV
-- (it is currently a placeholder, which is why the CASE emitted "(name pending)").
-- Until then, re-run THIS delta after any reseed — it is idempotent.
--
-- Keyed on the immutable principal_code (not the id/name), so it is stable across
-- environments. work_provider carries FORCE ROW LEVEL SECURITY and the app login
-- cespk_app does not own it — apply as the table owner (SET ROLE csadmin) per the
-- D7/D8 runbook (docs/azure/postgres.md).
--
-- PURE DATA — no columns/tables/choice codes; no deploy-order coupling.
-- Idempotent: re-running is a no-op once the name is corrected (WHERE excludes the
-- already-correct value).
--
-- PRE-CHECK (optional):
--   SELECT principal_code, display_name FROM work_provider WHERE principal_code = 'PCH';
-- =============================================================================

BEGIN;

UPDATE work_provider
   SET display_name = 'Performance Car Hire',
       updated_at   = now()
 WHERE principal_code = 'PCH'
   AND display_name IS DISTINCT FROM 'Performance Car Hire';

COMMIT;

-- POST-CHECK (expect 'Performance Car Hire'):
--   SELECT principal_code, display_name FROM work_provider WHERE principal_code = 'PCH';
