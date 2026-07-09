-- =============================================================================
-- 2026-07-09-case-done.sql
-- Case `done` terminal state + report_delivered audit action (idempotent)
-- -----------------------------------------------------------------------------
-- PURPOSE. Adds the choiceset rows for the post-EVA delivery lifecycle
-- (TKT-094/095/096; docs/adr/0023-post-eva-delivery-tracking-done.md):
--   - choice_case_status   : +1 row (done; code 100000012 -- the post-EVA
--                            delivery TERMINAL: "the CE report has been
--                            delivered back to the work provider". Follows
--                            eva_submitted; written only by the explicit
--                            mark-done transition, never by the status guard).
--   - choice_audit_action  : +1 row (report_delivered; code 100000053 -- the
--                            next free code after 100000052
--                            'image_analysis_generated'. NOTE: the original
--                            PLAN-case-done-lifecycle draft reserved 100000049,
--                            but 100000049-100000052 were minted since by
--                            TKT-068/110/016 -- do NOT reuse them).
--
-- No ALTER needed: `done` reuses the existing case_.status_code FK column and
-- the submitted_at column already exists. box_synced (100000009) is RETAINED
-- for historical rows but is no longer portrayed as the lifecycle tail.
--
-- DEPLOY ORDER. Apply BEFORE deploying the api build that writes status_code
-- 100000012 / audit action 100000053. The mark-done + eva-submitted routes
-- UPDATE case_.status_code = 100000012 -- an FK that HARD-FAILS on the missing
-- choice row (the report_delivered audit write would merely degrade: writeAudit
-- swallows its FK failure). Safe on its own: the rows sit unused until the new
-- routes deploy.
--
-- IDEMPOTENT + ADDITIVE + TRANSACTIONAL. ON CONFLICT DO NOTHING throughout; one
-- BEGIN..COMMIT. A fresh rebuild that already applied the companion canonical
-- file (../000_enums_lookups.sql) no-ops here. See ./README.md for the
-- canonical-vs-delta relationship.
--
-- APPLY RUNBOOK: docs/azure/postgres.md connection pattern (transient firewall rule ->
-- AAD token -> psql -> SET ROLE csadmin -> \i this file -> delete rule); csadmin owns
-- every table and bypasses RLS (this is schema DDL, not a staff/admin app-role write).
-- Verify with the queries at the foot.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. choice_case_status -- the `done` delivery terminal. Append-only: tops out
-- at 100000011 'removed' (../000_enums_lookups.sql). Parity ring moves 12 -> 13
-- statuses / 4 -> 5 terminals (case-status.json stateMachine.terminals).
-- ---------------------------------------------------------------------------
INSERT INTO choice_case_status (code, name, label) VALUES
  (100000012, 'done', 'Done')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. choice_audit_action -- the delivery audit action. Append-only: tops out
-- at 100000052 'image_analysis_generated'.
-- ---------------------------------------------------------------------------
INSERT INTO choice_audit_action (code, name, label) VALUES
  (100000053, 'report_delivered', 'Report Delivered')
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- VERIFY (all read-only):
--   SELECT code, name FROM choice_case_status WHERE code = 100000012;
--     -- expect: done
--   SELECT code, name FROM choice_audit_action WHERE code = 100000053;
--     -- expect: report_delivered
--   SELECT count(*) FROM choice_case_status;   -- expect: 13
