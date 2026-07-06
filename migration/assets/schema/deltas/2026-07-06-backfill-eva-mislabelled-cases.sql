-- =============================================================================
-- 2026-07-06-backfill-eva-mislabelled-cases.sql
-- TKT-065 — re-resolve + clean up cases mislabelled "EVA (Engineers)" (DATA ONLY)
-- -----------------------------------------------------------------------------
-- PURPOSE. Audit cases minted BEFORE the provider-resolution fix (engine-v2.6
-- suppression + the parse.ts cross-doc forwarding + the D8 pch-ltd.com domain
-- seed) resolved NO work provider: the parsed instruction was the audited EVA/CNX
-- report, whose layout name leaked into the free-text `eva_work_provider` column
-- while `work_provider_id` stayed NULL (new-client → Held, no Case/PO). The UI
-- (mappers.ts) then falls through to that free-text and shows "EVA (Engineers)".
--
-- The forward fix stops NEW cases doing this; this delta cleans the ALREADY-
-- persisted rows (pre-check 2026-07-06: 20 cases, all on_hold, work_provider_id
-- NULL, case_po NULL — direct pch-ltd.com senders + connexus.co.uk intermediary).
--
-- WHAT IT DOES (idempotent, one transaction):
--   1. Re-resolve work_provider_id from an UNAMBIGUOUS direct sender domain: for a
--      mislabelled case, if its inbound email(s) resolve to EXACTLY ONE active
--      work provider by known_email_domains (e.g. pch-ltd.com → PCH), set it. A
--      case whose only sender is the connexus.co.uk INTERMEDIARY (routes for
--      {PCH,SBL}) matches no work_provider domain → stays NULL/Held (never guessed).
--   2. Clear the leaked engineer-report layout name from eva_work_provider on ALL
--      mislabelled cases → the UI shows the resolved provider (via work_provider_id)
--      or blank, never "EVA (Engineers)".
--   3. Remove the stale field_level_provenance workProvider rows holding the dead value.
--
-- WHAT IT DELIBERATELY DOES NOT DO: it does NOT un-hold the case or mint a Case/PO
-- (that is the separate ADR-0022 case_po_floor cutover concern) — a person still
-- progresses each Held case. It fills the identity field so the correct provider is
-- visible; a genuinely ambiguous case (connexus-only) keeps a blank provider + Held.
--
-- Domain match is EXACT-or-comma-token (never a loose substring — so 'ltd.com'
-- cannot match 'pch-ltd.com'). Only ACTIVE providers are eligible (mirrors the
-- runtime matchProviderByDomain). Apply as the table owner (SET ROLE csadmin);
-- case_ / field_level_provenance carry FORCE RLS. Deploy-order-free, pure data.
--
-- PRE-CHECK (enumerate the affected set + verify none belong to an unrelated
-- provider whose name merely collides):
--   SELECT c.id, c.case_po, c.on_hold, c.work_provider_id, c.eva_work_provider,
--          e.from_address, e.sender_domain
--     FROM case_ c LEFT JOIN inbound_email e ON e.case_id = c.id
--    WHERE c.eva_work_provider ILIKE '%(engineers)%'
--       OR c.eva_work_provider ILIKE '%exclusive vehicle assessors%'
--       OR c.eva_work_provider ILIKE '%connexus vehicle assessors%';
-- =============================================================================

BEGIN;

-- 1. Re-resolve work_provider_id from an UNAMBIGUOUS direct sender domain.
WITH mislabelled AS (
  SELECT id
    FROM case_
   WHERE work_provider_id IS NULL
     AND ( eva_work_provider ILIKE '%eva (engineers)%'
        OR eva_work_provider ILIKE '%cnx (engineers)%'
        OR eva_work_provider ILIKE '%exclusive vehicle assessors%'
        OR eva_work_provider ILIKE '%connexus vehicle assessors%' )
),
domain_matches AS (
  SELECT DISTINCT m.id AS case_id, wp.id AS work_provider_id
    FROM mislabelled m
    JOIN inbound_email e ON e.case_id = m.id
    JOIN work_provider wp
      ON wp.active = true
     AND wp.known_email_domains IS NOT NULL
     AND e.sender_domain IS NOT NULL
     AND btrim(e.sender_domain) <> ''
     AND (
           -- single-domain value: exact (case-insensitive)
           lower(btrim(wp.known_email_domains)) = lower(btrim(e.sender_domain))
           -- comma-list value: exact token match (guards against substring collisions)
        OR (',' || replace(lower(wp.known_email_domains), ' ', '') || ',')
             LIKE ('%,' || lower(btrim(e.sender_domain)) || ',%')
         )
),
resolved AS (  -- keep only cases whose matched active provider is UNIQUE (never guess)
  -- (array_agg not min(): Postgres has no min() aggregate for uuid; HAVING count=1
  --  guarantees the single element, so element [1] is that unique provider.)
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

-- 2. Clear the leaked engineer-report layout name from the free-text provider column.
UPDATE case_
   SET eva_work_provider = '',
       updated_at        = now()
 WHERE eva_work_provider ILIKE '%eva (engineers)%'
    OR eva_work_provider ILIKE '%cnx (engineers)%'
    OR eva_work_provider ILIKE '%exclusive vehicle assessors%'
    OR eva_work_provider ILIKE '%connexus vehicle assessors%';

-- 3. Remove the stale workProvider provenance rows pointing at the dead value.
DELETE FROM field_level_provenance
 WHERE field_name = 'workProvider'
   AND value IN (
         'EVA (Engineers)',
         'CNX (Engineers)',
         'Exclusive Vehicle Assessors',
         'Connexus Vehicle Assessors'
       );

COMMIT;

-- POST-CHECK (expect 0 mislabelled; a mix of resolved PCH + blank connexus-only cases):
--   SELECT count(*) FROM case_
--    WHERE eva_work_provider ILIKE '%(engineers)%'
--       OR eva_work_provider ILIKE '%exclusive vehicle assessors%';   -- expect 0
--   SELECT c.id, c.work_provider_id, w.display_name
--     FROM case_ c LEFT JOIN work_provider w ON w.id = c.work_provider_id
--    WHERE c.on_hold = true AND c.case_po IS NULL
--    ORDER BY w.display_name NULLS FIRST;
