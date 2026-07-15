-- =============================================================================
-- 2026-07-02-tkt054-outlook-move.sql
-- TKT-054 / 020726 E6 -- Outlook filing lifecycle columns + audit actions (idempotent)
-- -----------------------------------------------------------------------------
-- PURPOSE. Adds the persistence for the gated "Suggested action -> file in Outlook"
-- path (docs/reviews/020726/decisions.md E6; docs/tickets/TKT-054-ui-work/):
--   - inbound_email        : +3 columns (outlook_move_state, outlook_moved_folder,
--                                        outlook_moved_at)
--   - choice_audit_action  : +3 rows    (outlook_move_requested, outlook_moved,
--                                        outlook_move_failed; codes 100000039-41)
--
-- DEPLOY ORDER. Apply BEFORE the api/orch deploy that ships the outlook-move routes --
-- the enqueue route UPDATEs outlook_move_state and would fail on a missing column.
-- Safe on its own: the columns/rows sit unused until the code ships, and the whole
-- path stays dark behind OUTLOOK_MOVE_ENABLED (default off) until the operator grants
-- the Mail.ReadWrite Exchange-RBAC re-consent (docs/gated.md).
--
-- IDEMPOTENT + ADDITIVE + TRANSACTIONAL. Every statement is safe to re-run
-- (IF NOT EXISTS / ON CONFLICT DO NOTHING); one BEGIN..COMMIT. A fresh rebuild that
-- already applied the companion canonical edits (../120_inbound_email.sql,
-- ../000_enums_lookups.sql) no-ops here. See ./README.md for canonical-vs-delta.
--
-- APPLY RUNBOOK: docs/azure/postgres.md connection pattern (transient firewall rule ->
-- AAD token -> psql -> delete rule), run as csadmin; verify with the queries at the foot.
-- =============================================================================
BEGIN;

ALTER TABLE inbound_email ADD COLUMN IF NOT EXISTS outlook_move_state   varchar(20);
ALTER TABLE inbound_email ADD COLUMN IF NOT EXISTS outlook_moved_folder varchar(128);
ALTER TABLE inbound_email ADD COLUMN IF NOT EXISTS outlook_moved_at     timestamptz;

-- The CHECK lives in a named constraint so the re-run guard can see it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_inbound_email_outlook_move_state'
  ) THEN
    ALTER TABLE inbound_email ADD CONSTRAINT ck_inbound_email_outlook_move_state
      CHECK (outlook_move_state IS NULL OR outlook_move_state IN ('queued','moved','failed'));
  END IF;
END $$;

INSERT INTO choice_audit_action (code, name, label) VALUES
  (100000039, 'outlook_move_requested', 'Outlook Move Requested'),
  (100000040, 'outlook_moved',          'Outlook Moved'),
  (100000041, 'outlook_move_failed',    'Outlook Move Failed')
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- VERIFY (expect 3 columns + 3 audit rows):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'inbound_email' AND column_name LIKE 'outlook_%';
--   SELECT code, name FROM choice_audit_action WHERE code BETWEEN 100000039 AND 100000041;
