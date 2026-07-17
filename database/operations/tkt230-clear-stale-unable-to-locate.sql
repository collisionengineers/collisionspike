-- =============================================================================
-- TKT-230 — one-time operator procedure (NOT a migration; run manually, once,
-- against cespk-pg-dev/collisionspike, banking the pre/post counts into
-- docs/tickets/now/TKT-230-retro-post-sweep-remediation/evidence/).
--
-- Section 1 clears the stale `unable_to_locate` stamps that TKT-230 item 4's
-- code fix prevents from recurring (retroRecordFailure stamped the row, a later
-- retro link filled case_id, and nothing cleared the stamp).
--
-- Section 2 surfaces the EXISTING re-labelled receiving_work instructions
-- (item 7): rows carrying an instruction label with no case, no chip, no
-- suggestion — stamp them `unable_to_locate` so the existing attention chip
-- (inbox-panels.tsx renders it for `!caseId && attentionReason`) makes them
-- visible. Alternative considered and NOT recommended: force re-drive of the
-- rows through retro-case (slower, Graph-dependent, and the new orchestrator
-- guard would stamp the same reason anyway) — the SQL is the direct form.
--
-- Both sections are idempotent: a second run finds zero matching rows.
-- =============================================================================

\set ON_ERROR_STOP on

SET ROLE csadmin;

-- =============================================================================
-- Section 1 — clear stale `unable_to_locate` on rows that DID link (item 4)
-- =============================================================================

-- Pre-check (expected 12 as of the 2026-07-16 audit; any linked+stamped row counts):
SELECT count(*) AS stale_unable_to_locate_pre
  FROM inbound_email
 WHERE case_id IS NOT NULL
   AND attention_reason = 'unable_to_locate';

BEGIN;

UPDATE inbound_email
   SET attention_reason = NULL,
       updated_at = now()
 WHERE case_id IS NOT NULL
   AND attention_reason = 'unable_to_locate';

COMMIT;

-- Post-check (expect 0):
SELECT count(*) AS stale_unable_to_locate_post
  FROM inbound_email
 WHERE case_id IS NOT NULL
   AND attention_reason = 'unable_to_locate';

-- =============================================================================
-- Section 2 — surface the un-cased receiving_work instructions (item 7)
-- =============================================================================

-- Resolve the receiving_work category code from the choice table (never hardcode):
SELECT code AS receiving_work_code
  FROM choice_inbound_category
 WHERE name = 'receiving_work';

-- Pre-check (expected 21 as of the 2026-07-16 audit):
SELECT count(*) AS unsurfaced_receiving_work_pre
  FROM inbound_email
 WHERE case_id IS NULL
   AND attention_reason IS NULL
   AND category_code = (SELECT code FROM choice_inbound_category WHERE name = 'receiving_work')
   AND (triage_state IS NULL OR triage_state NOT IN ('actioned', 'dismissed'));

BEGIN;

UPDATE inbound_email
   SET attention_reason = 'unable_to_locate',
       updated_at = now()
 WHERE case_id IS NULL
   AND attention_reason IS NULL
   AND category_code = (SELECT code FROM choice_inbound_category WHERE name = 'receiving_work')
   AND (triage_state IS NULL OR triage_state NOT IN ('actioned', 'dismissed'));

COMMIT;

-- Post-check (expect 0 remaining unsurfaced; the stamped rows now carry the chip):
SELECT count(*) AS unsurfaced_receiving_work_post
  FROM inbound_email
 WHERE case_id IS NULL
   AND attention_reason IS NULL
   AND category_code = (SELECT code FROM choice_inbound_category WHERE name = 'receiving_work')
   AND (triage_state IS NULL OR triage_state NOT IN ('actioned', 'dismissed'));

-- Cross-check: how many rows now show the chip for this cohort (expect the pre count):
SELECT count(*) AS surfaced_receiving_work
  FROM inbound_email
 WHERE case_id IS NULL
   AND attention_reason = 'unable_to_locate'
   AND category_code = (SELECT code FROM choice_inbound_category WHERE name = 'receiving_work');

RESET ROLE;
