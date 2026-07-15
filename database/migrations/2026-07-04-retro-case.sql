-- =============================================================================
-- 2026-07-04-retro-case.sql
-- Retroactive case reconstruction -- audit actions + intake channel (idempotent)
-- -----------------------------------------------------------------------------
-- PURPOSE. Adds the code-table rows for the retro case-reconstruction fallback
-- (TKT-058; docs/adr/0022-retroactive-case-reconstruction.md): when an inbound
-- billing / case_update / cancellation / query email matches NO existing case,
-- the gated ladder links-or-reconstructs the case from the Box archive /
-- Outlook search instead of leaving the email stranded in triage.
--   - choice_audit_action        : +3 rows (retro_case_created,
--                                           retro_case_linked,
--                                           retro_reconstruction_failed; codes 100000046-48)
--   - choice_intake_channel_kind : +1 row  (retro; code 100000003 -- the
--                                           reconstructed-case provenance)
--
-- DEPLOY ORDER. Apply BEFORE flipping RETRO_CASE_ENABLED on the api + orch apps.
-- The retro create route writes case_.intake_channel_kind_code = 100000003 -- an
-- FK that HARD-FAILS on the missing choice row (unlike the audit writes, whose
-- writeAudit failures are swallowed). Safe on its own: the rows sit unused until
-- the gate flips; the fallback is inert while RETRO_CASE_ENABLED is absent/false.
--
-- IDEMPOTENT + ADDITIVE + TRANSACTIONAL. ON CONFLICT DO NOTHING throughout; one
-- BEGIN..COMMIT. A fresh rebuild that already applied the companion canonical
-- file (../000_enums_lookups.sql) no-ops here. See ./README.md for the
-- canonical-vs-delta relationship.
--
-- APPLY RUNBOOK: docs/operations/database.md connection pattern (transient firewall rule ->
-- AAD token -> psql -> SET ROLE csadmin -> \i this file -> delete rule); csadmin owns
-- every table and bypasses RLS (this is schema DDL, not a staff/admin app-role write).
-- Verify with the queries at the foot.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. choice_audit_action -- three retro-lifecycle actions. Append-only: tops
-- out at 100000045 'provider_api_case_rejected' (../000_enums_lookups.sql).
-- ---------------------------------------------------------------------------
INSERT INTO choice_audit_action (code, name, label) VALUES
  (100000046, 'retro_case_created',          'Retro Case Created'),
  (100000047, 'retro_case_linked',           'Retro Case Linked'),
  (100000048, 'retro_reconstruction_failed', 'Retro Reconstruction Failed')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. choice_intake_channel_kind -- the reconstructed-case provenance. Append-only:
-- 100000000 'email' + 100000001 'whatsapp' + 100000002 'provider_api' are live.
-- ---------------------------------------------------------------------------
INSERT INTO choice_intake_channel_kind (code, name, label) VALUES
  (100000003, 'retro', 'Retro (reconstructed)')
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- VERIFY (all read-only):
--   SELECT code, name FROM choice_audit_action WHERE code BETWEEN 100000046 AND 100000048 ORDER BY code;
--     -- expect: retro_case_created, retro_case_linked, retro_reconstruction_failed
--   SELECT code, name FROM choice_intake_channel_kind WHERE code = 100000003;
--     -- expect: retro
