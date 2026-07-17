-- =============================================================================
-- TKT-233 — one-time operator procedure (NOT a migration; run manually, once,
-- against cespk-pg-dev/collisionspike, banking the pre/post row lists into the
-- owning ticket's evidence/ folder).
--
-- Clears claimant emails harvested at OUR OWN domain. A PCH instruction PDF
-- quoted our intake address (engineers@collisionengineers.co.uk) in its
-- boilerplate and the parser's sole-email fallback stored it as the CLAIMANT's
-- email on a reconstructed case. The engine fix (own-domain rejection in
-- _is_non_claimant_email, sibling cedocumentmapper_v2.0 + vendored copy)
-- prevents recurrence; this clears the rows already written. Blank beats wrong
-- — staff fill the real address in.
--
-- Known instance at authoring time (2026-07-17):
--   case id b5ffe5e4-0ffc-4510-8d2f-29f9de03d47b, case_po AC14ACE,
--   eva_claimant_email = 'engineers@collisionengineers.co.uk'.
-- The predicate deliberately covers the whole domain (any local part), so any
-- sibling instance (info@ / desk@ / etc.) is caught by the same run.
--
-- Idempotent: a second run finds zero matching rows.
-- =============================================================================

\set ON_ERROR_STOP on

SET ROLE csadmin;

-- Pre-check — list every affected row (expected: the single known instance;
-- bank this output as evidence before updating):
SELECT id, case_po, eva_claimant_email
  FROM case_
 WHERE eva_claimant_email ILIKE '%@collisionengineers.co.uk';

BEGIN;

UPDATE case_
   SET eva_claimant_email = NULL,
       updated_at = now()
 WHERE eva_claimant_email ILIKE '%@collisionengineers.co.uk';

COMMIT;

-- Post-check (expect 0):
SELECT count(*) AS own_domain_claimant_emails_post
  FROM case_
 WHERE eva_claimant_email ILIKE '%@collisionengineers.co.uk';

RESET ROLE;
