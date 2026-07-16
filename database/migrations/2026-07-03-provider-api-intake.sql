-- =============================================================================
-- 2026-07-03-provider-api-intake.sql
-- Provider API intake channel -- table + audit actions + channel kind (idempotent)
-- -----------------------------------------------------------------------------
-- PURPOSE. Adds the persistence for the machine-to-machine provider intake channel
-- (TKT-055; docs/adr/0020-provider-api-intake-channel.md; publishable contract in
-- docs/reference/provider-api-intake-spec.md):
--   - provider_api_key          : NEW table (hash-only, show-once API keys) + FK + RLS + GRANT
--   - choice_audit_action       : +4 rows (api_key_created, api_key_revoked,
--                                           provider_api_case_created,
--                                           provider_api_case_rejected; codes 100000042-45)
--   - choice_intake_channel_kind : +1 row  (provider_api; code 100000002)
--
-- DEPLOY ORDER. Apply BEFORE the api deploy that ships the provider-keys +
-- provider-intake routes -- the key routes INSERT/UPDATE provider_api_key and the
-- intake route writes case_.intake_channel_kind_code = 100000002 + the new audit
-- codes, all of which would fail on the missing table / FK-referenced choice rows.
-- Safe on its own: the table + rows sit unused until the code ships, and the whole
-- channel is inert until at least one API key is minted by a Superuser.
--
-- IDEMPOTENT + ADDITIVE + TRANSACTIONAL. Every statement is safe to re-run
-- (CREATE TABLE/INDEX IF NOT EXISTS / ON CONFLICT DO NOTHING / guarded ADD
-- CONSTRAINT + policy creates); one BEGIN..COMMIT. A fresh rebuild that already
-- applied the companion canonical files (../170_provider_api_key.sql,
-- ../000_enums_lookups.sql, ../900_constraints.sql) no-ops here. See ./README.md
-- for the canonical-vs-delta relationship.
--
-- APPLY RUNBOOK: docs/operations/database.md connection pattern (transient firewall rule ->
-- AAD token -> psql -> SET ROLE csadmin -> \i this file -> delete rule); csadmin owns
-- every table and bypasses RLS (this is schema DDL, not a staff/admin app-role write).
-- Verify with the queries at the foot.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. provider_api_key -- the hash-only, show-once key table (../170_provider_api_key.sql).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS provider_api_key (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_provider_id  uuid NOT NULL,
  label             varchar(200) NOT NULL,
  key_prefix        varchar(12) NOT NULL,
  key_hash          varchar(128) NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        text,
  revoked_at        timestamptz,
  last_used_at      timestamptz
);

CREATE INDEX IF NOT EXISTS ix_provider_api_key_prefix
  ON provider_api_key (key_prefix) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_provider_api_key_work_provider
  ON provider_api_key (work_provider_id);

-- FK -> work_provider (CASCADE). Guarded so a re-run does not error on the existing constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_provider_api_key_work_provider'
  ) THEN
    ALTER TABLE provider_api_key ADD CONSTRAINT fk_provider_api_key_work_provider
      FOREIGN KEY (work_provider_id) REFERENCES work_provider(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Row-Level Security -- same staff/admin pattern as every other work table
-- (../900_constraints.sql RLS loop): read/insert/update for staff+admin, DELETE admin-only.
ALTER TABLE provider_api_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_api_key FORCE  ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'provider_api_key' AND policyname = 'p_provider_api_key_rw') THEN
    CREATE POLICY p_provider_api_key_rw ON provider_api_key
      USING (current_setting('app.role', true) IN ('staff','admin'))
      WITH CHECK (current_setting('app.role', true) IN ('staff','admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'provider_api_key' AND policyname = 'p_provider_api_key_no_delete') THEN
    CREATE POLICY p_provider_api_key_no_delete ON provider_api_key AS RESTRICTIVE FOR DELETE
      USING (current_setting('app.role', true) = 'admin');
  END IF;
END $$;

-- Application-login privileges. cespk_app does NOT own the table (csadmin does), so it
-- needs an explicit grant to read/insert/update (never DELETE -- revoke is a soft flag).
-- Guarded on role existence so a fresh test DB without the app login does not fail.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE ON provider_api_key TO cespk_app;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. choice_audit_action -- four new provider-API lifecycle actions. Append-only:
-- tops out at 100000041 'outlook_move_failed' (../000_enums_lookups.sql).
-- ---------------------------------------------------------------------------
INSERT INTO choice_audit_action (code, name, label) VALUES
  (100000042, 'api_key_created',            'API Key Created'),
  (100000043, 'api_key_revoked',            'API Key Revoked'),
  (100000044, 'provider_api_case_created',  'Provider API Case Created'),
  (100000045, 'provider_api_case_rejected', 'Provider API Case Rejected')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. choice_intake_channel_kind -- the new machine-to-machine channel. Append-only:
-- 100000000 'email' + 100000001 'whatsapp' are already live.
-- ---------------------------------------------------------------------------
INSERT INTO choice_intake_channel_kind (code, name, label) VALUES
  (100000002, 'provider_api', 'Provider API')
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- VERIFY (all read-only):
--   SELECT to_regclass('public.provider_api_key');            -- expect: provider_api_key (not NULL)
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'provider_api_key'; -- expect t | t
--   SELECT policyname FROM pg_policies WHERE tablename = 'provider_api_key' ORDER BY policyname;
--     -- expect p_provider_api_key_no_delete, p_provider_api_key_rw
--   SELECT code, name FROM choice_audit_action WHERE code BETWEEN 100000042 AND 100000045 ORDER BY code;
--   SELECT code, name FROM choice_intake_channel_kind WHERE code = 100000002;
