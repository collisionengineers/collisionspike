-- =============================================================================
-- 2026-07-03-deactivate-eva-work-provider.sql
-- TKT-051 follow-on -- deactivate any "EVA" work_provider row (idempotent, DATA ONLY)
-- -----------------------------------------------------------------------------
-- PURPOSE. EVA (Exclusive Vehicle Assessors) is NOT a Collision Engineers work
-- provider -- it is an engineering firm whose reports CE AUDITS (the third-party
-- original on a PCH/QDOS audit case; docs/adr/0014-audit-case-type-second-
-- inspection.md, docs/adr/0021-case-po-marker-taxonomy.md). The operator reports
-- EVA "was logged in our providers list" -- a legacy Dataverse-era corpus row that
-- made it possible for an attached EVA report to resolve as the case's work
-- provider. The code paths are now guarded (engine-v2.6 suppresses the layout-name
-- fallback; the Data API denylists engineer-report layout names in
-- api/src/lib/parser-eva-fields.ts), and this delta closes the DATA side: the row
-- is DEACTIVATED (never deleted -- historical cases may reference it) so neither
-- matchProviderByDomain (filters active) nor matchWorkProviderByContentString
-- (queried WHERE active = true) can ever select it.
--
-- PRE-CHECK (run first; decides whether this is a real UPDATE or a no-op):
--   SELECT id, principal_code, display_name, active, known_email_domains
--     FROM work_provider
--    WHERE display_name ILIKE '%exclusive vehicle%'
--       OR display_name ILIKE '%eva (engineers)%'
--       OR upper(principal_code) = 'EVA';
-- REVIEW the hits before applying: if a row named like EVA is a GENUINE unrelated
-- provider (e.g. a solicitor whose code merely collides with "EVA"), exclude it by
-- editing the WHERE below -- the statement deliberately keys on the FULL
-- Exclusive-Vehicle-Assessors / "EVA (Engineers)" names, NOT the bare 3-letter
-- code, precisely to avoid sweeping up an innocent collision.
--
-- PURE DATA -- no columns/tables/choice codes; no deploy-order coupling. Safe to
-- apply before or after the api/orch/parser deploys (the code guards and this data
-- change are independent layers of the same defense).
-- Idempotent: re-running is a no-op (rows already inactive are excluded).
-- =============================================================================

BEGIN;

UPDATE work_provider
   SET active = false
 WHERE active = true
   AND (
         display_name ILIKE '%exclusive vehicle assessors%'
      OR display_name ILIKE '%eva (engineers)%'
       );

-- Belt-and-braces: strip any e-mail match domains such a row may carry, so even a
-- future manual re-activation cannot silently re-enable sender-domain matching to
-- the audited firm (the operator would have to consciously re-seed domains too).
UPDATE work_provider
   SET known_email_domains = '{}'
 WHERE active = false
   AND (
         display_name ILIKE '%exclusive vehicle assessors%'
      OR display_name ILIKE '%eva (engineers)%'
       )
   AND known_email_domains IS DISTINCT FROM '{}';

COMMIT;

-- POST-CHECK (expect zero ACTIVE hits):
--   SELECT count(*) FROM work_provider
--    WHERE active = true
--      AND (display_name ILIKE '%exclusive vehicle assessors%'
--        OR display_name ILIKE '%eva (engineers)%');
