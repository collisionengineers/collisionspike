-- =============================================================================
-- 2026-07-06-backfill-providers-active-cases.sql
-- Backfill pass Phase 1 — widen TKT-065 provider re-resolution to ALL active cases
-- (DATA ONLY, idempotent, one transaction). Sibling of, and modelled on,
-- 2026-07-06-backfill-eva-mislabelled-cases.sql — read that file's header first.
-- -----------------------------------------------------------------------------
-- PURPOSE. The earlier TKT-065 delta cleaned the 20 cases whose free-text
-- `eva_work_provider` had leaked an engineer-report layout name ("EVA (Engineers)"
-- etc.). This delta generalises the SAME never-guess domain resolution to the whole
-- ACTIVE set: every active case (status NOT IN eva_submitted/box_synced/error/removed)
-- that still has work_provider_id NULL, resolved from an UNAMBIGUOUS direct sender
-- domain, regardless of whether it carries a leaked label.
--
-- PRE-FLIGHT (2026-07-06, read as csadmin / RLS-bypass): 166 active cases; 24 have
-- work_provider_id NULL (all on_hold, all case_po NULL). Of those 24: 9 resolve to
-- exactly ONE active provider by sender domain (PCH x6, Fairway/FW x2, DFD x1),
-- 0 are ambiguous, 15 have no direct-domain match (13 connexus.co.uk intermediary
-- + berwicks + complexreports) and correctly STAY Held.
--
-- WHAT IT DOES (idempotent, one transaction):
--   1. Fill work_provider_id from an UNAMBIGUOUS direct sender domain (EXACT or
--      newline/comma token match; ACTIVE providers only; HAVING count=1 → never
--      guessed). Only touches rows where work_provider_id IS NULL.
--   2. For cases step 1 just resolved, set the free-text eva_work_provider to the
--      resolved provider's canonical display_name (the required EVA workProvider
--      field reads THIS column, not the FK). Idempotent: only where it differs.
--   3. Blank any residual engineer-report leak label on a STILL-unresolved case
--      (denylist-scoped — mirrors the TKT-065 delta step 2b; does NOT touch a
--      legitimate free-text principal hint like "QCL").
--   4. Delete stale field_level_provenance workProvider rows holding a dead
--      engineer-report value.
--
-- WHAT IT DELIBERATELY DOES NOT DO:
--   * It does NOT overwrite an EXISTING non-null work_provider_id. A case already
--     resolved (possibly by a human or the intermediary fallback) is left alone;
--     any FK-vs-domain DISAGREEMENT is only REPORTED (see the mismatch pre-check
--     below) for human review — never auto-changed (that would fight manual/
--     intermediary overrides and could mis-mint a Case/PO).
--   * It does NOT un-hold or mint a Case/PO — that is Phase 2 (ADR-0022
--     case_po_floor cutover), a separate delta.
--   * It does NOT content-string resolve (principal code in free-text); domain-only,
--     the conservative path.
--
-- Apply as the table owner (SET ROLE csadmin); case_ / field_level_provenance carry
-- FORCE RLS. Deploy-order-free, pure data. Safe to run more than once.
--
-- PRE-CHECK A — enumerate the resolvable set (expect the 9 above):
--   WITH active_unresolved AS (
--     SELECT id FROM case_
--      WHERE status_code NOT IN (100000008,100000009,100000010,100000011)
--        AND work_provider_id IS NULL)
--   SELECT au.id, e.sender_domain, wp.principal_code, wp.display_name
--     FROM active_unresolved au
--     JOIN inbound_email e ON e.case_id = au.id
--     JOIN work_provider wp ON wp.active
--      AND (',' || translate(replace(lower(wp.known_email_domains),' ',''),E'\n\r',',,') || ',')
--            LIKE ('%,' || lower(btrim(e.sender_domain)) || ',%')
--    ORDER BY wp.principal_code;
--
-- PRE-CHECK B — REPORT existing-FK vs domain DISAGREEMENTS (review by hand; this
-- delta will NOT change these):
--   SELECT c.id, c.work_provider_id AS current_fk, wp.id AS domain_fk,
--          wpc.display_name AS current_name, wp.display_name AS domain_name
--     FROM case_ c
--     JOIN inbound_email e ON e.case_id = c.id
--     JOIN work_provider wp ON wp.active
--      AND (',' || translate(replace(lower(wp.known_email_domains),' ',''),E'\n\r',',,') || ',')
--            LIKE ('%,' || lower(btrim(e.sender_domain)) || ',%')
--     LEFT JOIN work_provider wpc ON wpc.id = c.work_provider_id
--    WHERE c.status_code NOT IN (100000008,100000009,100000010,100000011)
--      AND c.work_provider_id IS NOT NULL
--      AND c.work_provider_id <> wp.id;
-- =============================================================================

BEGIN;

-- 1. Fill work_provider_id from an UNAMBIGUOUS direct sender domain (never guess).
WITH active_unresolved AS (
  SELECT id
    FROM case_
   WHERE status_code NOT IN (100000008,100000009,100000010,100000011)  -- active only
     AND work_provider_id IS NULL
),
domain_matches AS (
  SELECT DISTINCT au.id AS case_id, wp.id AS work_provider_id
    FROM active_unresolved au
    JOIN inbound_email e ON e.case_id = au.id
    JOIN work_provider wp
      ON wp.active = true
     AND wp.known_email_domains IS NOT NULL
     AND e.sender_domain IS NOT NULL
     AND btrim(e.sender_domain) <> ''
     AND (
           -- single-domain value: exact (case-insensitive)
           lower(btrim(wp.known_email_domains)) = lower(btrim(e.sender_domain))
           -- multi-domain value: exact token match. known_email_domains is stored
           -- NEWLINE-separated (providers.ts join('\n')); seeds also accept commas —
           -- normalise BOTH \n and \r to commas (after stripping spaces) before the
           -- comma-token LIKE, so "old.example\npch-ltd.com" still matches, and a
           -- loose substring ('ltd.com' vs 'pch-ltd.com') never does.
        OR (',' || translate(replace(lower(wp.known_email_domains), ' ', ''), E'\n\r', ',,') || ',')
             LIKE ('%,' || lower(btrim(e.sender_domain)) || ',%')
         )
),
resolved AS (  -- keep only cases whose matched active provider is UNIQUE
  SELECT case_id, (array_agg(DISTINCT work_provider_id))[1] AS work_provider_id
    FROM domain_matches
   GROUP BY case_id
  HAVING count(DISTINCT work_provider_id) = 1
)
UPDATE case_ c
   SET work_provider_id = r.work_provider_id,
       updated_at       = now()
  FROM resolved r
 WHERE c.id = r.case_id
   AND c.work_provider_id IS NULL;

-- 2. For the freshly-resolved cases, set the free-text eva_work_provider to the
--    provider's canonical display_name (idempotent — only where it differs). Scope
--    tightly to cases whose sender domain uniquely matches THIS provider, so we only
--    (re)write the identity field on rows this backfill is responsible for.
WITH active_domain_resolved AS (
  SELECT c.id AS case_id, c.work_provider_id AS wp_id
    FROM case_ c
   WHERE c.status_code NOT IN (100000008,100000009,100000010,100000011)
     AND c.work_provider_id IS NOT NULL
     AND EXISTS (
           SELECT 1
             FROM inbound_email e
             JOIN work_provider wp
               ON wp.id = c.work_provider_id
              AND wp.active = true
              AND ( lower(btrim(wp.known_email_domains)) = lower(btrim(e.sender_domain))
                 OR (',' || translate(replace(lower(wp.known_email_domains), ' ', ''), E'\n\r', ',,') || ',')
                      LIKE ('%,' || lower(btrim(e.sender_domain)) || ',%') )
            WHERE e.case_id = c.id
              AND e.sender_domain IS NOT NULL AND btrim(e.sender_domain) <> ''
         )
)
UPDATE case_ c
   SET eva_work_provider = w.display_name,
       updated_at        = now()
  FROM active_domain_resolved r
  JOIN work_provider w ON w.id = r.wp_id
 WHERE c.id = r.case_id
   AND c.eva_work_provider IS DISTINCT FROM w.display_name;

-- 3. Blank any residual engineer-report leak label on a STILL-unresolved case
--    (denylist-scoped; never touches a legitimate free-text hint).
UPDATE case_
   SET eva_work_provider = '',
       updated_at        = now()
 WHERE status_code NOT IN (100000008,100000009,100000010,100000011)
   AND work_provider_id IS NULL
   AND ( eva_work_provider ILIKE '%eva (engineers)%'
      OR eva_work_provider ILIKE '%cnx (engineers)%'
      OR eva_work_provider ILIKE '%exclusive vehicle assessors%'
      OR eva_work_provider ILIKE '%connexus vehicle assessors%' );

-- 4. Remove stale workProvider provenance rows pointing at a dead engineer-report value.
DELETE FROM field_level_provenance
 WHERE field_name = 'workProvider'
   AND value IN (
         'EVA (Engineers)',
         'CNX (Engineers)',
         'Exclusive Vehicle Assessors',
         'Connexus Vehicle Assessors'
       );

COMMIT;

-- POST-CHECK (expect: ~9 newly-resolved active cases now carry an FK + real name;
-- 0 residual engineer-report leak labels; the connexus-only set STILL Held/NULL):
--   SELECT count(*) FILTER (WHERE work_provider_id IS NOT NULL) AS resolved,
--          count(*) FILTER (WHERE work_provider_id IS NULL)     AS still_held
--     FROM case_
--    WHERE status_code NOT IN (100000008,100000009,100000010,100000011) AND on_hold;
--   SELECT count(*) FROM case_
--    WHERE eva_work_provider ILIKE '%(engineers)%'
--       OR eva_work_provider ILIKE '%exclusive vehicle assessors%';   -- expect 0
