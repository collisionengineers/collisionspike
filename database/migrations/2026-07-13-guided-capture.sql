-- Guided capture live delta. Fresh builds receive the same objects from
-- 196_capture_session.sql, 060_evidence.sql, 000_enums_lookups.sql and
-- 900_constraints.sql. This file is replay-safe for the existing live database.
BEGIN;

INSERT INTO choice_audit_action (code, name, label) VALUES
  (100000056, 'capture_session_created',   'Capture Session Created'),
  (100000057, 'capture_session_rotated',   'Capture Session Rotated'),
  (100000058, 'capture_session_revoked',   'Capture Session Revoked'),
  (100000059, 'capture_asset_validated',   'Capture Asset Validated'),
  (100000060, 'capture_session_completed', 'Capture Session Completed'),
  (100000061, 'capture_session_retargeted','Capture Session Retargeted'),
  (100000062, 'capture_session_locked',    'Capture Session Locked')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE evidence DROP CONSTRAINT IF EXISTS evidence_image_role_source_check;
ALTER TABLE evidence DROP CONSTRAINT IF EXISTS ck_evidence_image_role_source;
ALTER TABLE evidence ADD CONSTRAINT ck_evidence_image_role_source
  CHECK (image_role_source IS NULL OR image_role_source IN ('classifier','staff','provider','capture','cleanup','legacy'));
ALTER TABLE evidence DROP CONSTRAINT IF EXISTS evidence_registration_visible_source_check;
ALTER TABLE evidence DROP CONSTRAINT IF EXISTS ck_evidence_registration_visible_source;
ALTER TABLE evidence ADD CONSTRAINT ck_evidence_registration_visible_source
  CHECK (registration_visible_source IS NULL OR registration_visible_source IN ('classifier','staff','provider','capture','cleanup','legacy'));
ALTER TABLE evidence DROP CONSTRAINT IF EXISTS evidence_accepted_for_eva_source_check;
ALTER TABLE evidence DROP CONSTRAINT IF EXISTS ck_evidence_accepted_for_eva_source;
ALTER TABLE evidence ADD CONSTRAINT ck_evidence_accepted_for_eva_source
  CHECK (accepted_for_eva_source IS NULL OR accepted_for_eva_source IN ('classifier','staff','provider','capture','cleanup','legacy'));
ALTER TABLE evidence DROP CONSTRAINT IF EXISTS evidence_exclusion_decision_source_check;
ALTER TABLE evidence DROP CONSTRAINT IF EXISTS ck_evidence_exclusion_decision_source;
ALTER TABLE evidence ADD CONSTRAINT ck_evidence_exclusion_decision_source
  CHECK (exclusion_decision_source IS NULL OR exclusion_decision_source IN ('classifier','staff','provider','capture','cleanup','legacy'));

CREATE TABLE IF NOT EXISTS capture_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES case_(id) ON DELETE CASCADE,
  status varchar(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open','complete','revoked','locked','expired')),
  shot_plan_id varchar(64) NOT NULL CHECK (shot_plan_id IN ('essential-v1','standard-exterior-v1')),
  shot_plan_label varchar(120) NOT NULL,
  guidance_mode varchar(16) NOT NULL DEFAULT 'advisory' CHECK (guidance_mode IN ('off','shadow','advisory','enforced')),
  rules_version varchar(64) NOT NULL,
  model_version varchar(120),
  bootstrap_token_hash char(64) NOT NULL UNIQUE CHECK (bootstrap_token_hash ~ '^[0-9a-f]{64}$'),
  token_generation integer NOT NULL DEFAULT 1 CHECK (token_generation >= 1),
  expires_at timestamptz NOT NULL,
  created_by varchar(320) NOT NULL,
  submitted_at timestamptz,
  submit_idempotency_key varchar(128),
  revoked_at timestamptz,
  locked_at timestamptz,
  expired_at timestamptz,
  last_exchanged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE capture_session ADD COLUMN IF NOT EXISTS submit_idempotency_key varchar(128);
ALTER TABLE capture_session ADD COLUMN IF NOT EXISTS expired_at timestamptz;
ALTER TABLE capture_session DROP CONSTRAINT IF EXISTS capture_session_status_check;
ALTER TABLE capture_session ADD CONSTRAINT capture_session_status_check
  CHECK (status IN ('open','complete','revoked','locked','expired'));
CREATE INDEX IF NOT EXISTS ix_capture_session_case ON capture_session (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_capture_session_expiry ON capture_session (expires_at) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS capture_session_resume_token (
  token_hash char(64) PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  session_id uuid NOT NULL REFERENCES capture_session(id) ON DELETE CASCADE,
  token_generation integer NOT NULL CHECK (token_generation >= 1),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX IF NOT EXISTS ix_capture_resume_session
  ON capture_session_resume_token (session_id, created_at DESC, token_hash DESC);
CREATE INDEX IF NOT EXISTS ix_capture_resume_expiry
  ON capture_session_resume_token (expires_at);

CREATE TABLE IF NOT EXISTS capture_session_shot (
  session_id uuid NOT NULL REFERENCES capture_session(id) ON DELETE CASCADE,
  shot_id varchar(64) NOT NULL,
  role varchar(40) NOT NULL,
  evidence_role varchar(24) NOT NULL CHECK (evidence_role IN ('overview','damage_closeup','additional','unknown')),
  label varchar(160) NOT NULL,
  prompt varchar(500) NOT NULL,
  required boolean NOT NULL,
  sequence integer NOT NULL CHECK (sequence >= 0),
  guidance_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (session_id, shot_id),
  UNIQUE (session_id, sequence)
);
ALTER TABLE capture_session_shot DROP COLUMN IF EXISTS repeatable;

CREATE TABLE IF NOT EXISTS capture_asset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES capture_session(id) ON DELETE CASCADE,
  shot_id varchar(64) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  state varchar(24) NOT NULL DEFAULT 'upload_pending' CHECK (state IN ('upload_pending','validating','accepted','pending_review','rejected','superseded','materialised')),
  selected boolean NOT NULL DEFAULT false,
  file_name varchar(400) NOT NULL,
  declared_content_type varchar(200) NOT NULL,
  declared_size_bytes bigint NOT NULL CHECK (declared_size_bytes > 0),
  declared_sha256 char(64) NOT NULL CHECK (declared_sha256 ~ '^[0-9a-f]{64}$'),
  server_content_type varchar(200),
  server_size_bytes bigint,
  server_sha256 char(64) CHECK (server_sha256 IS NULL OR server_sha256 ~ '^[0-9a-f]{64}$'),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  blob_path varchar(1000) NOT NULL UNIQUE,
  upload_expires_at timestamptz NOT NULL,
  validation_attempt uuid,
  validation_lease_expires_at timestamptz,
  validation_code varchar(80),
  client_quality jsonb,
  server_quality jsonb,
  evidence_id uuid REFERENCES evidence(id) ON DELETE SET NULL,
  materialised_at timestamptz,
  staging_deleted_at timestamptz,
  blob_deleted_at timestamptz,
  cleanup_code varchar(80),
  cleanup_attempt_count integer NOT NULL DEFAULT 0,
  cleanup_next_attempt_at timestamptz,
  cleanup_last_error_category varchar(80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT capture_asset_cleanup_attempt_count_check CHECK (cleanup_attempt_count >= 0),
  FOREIGN KEY (session_id, shot_id) REFERENCES capture_session_shot(session_id, shot_id) ON DELETE CASCADE,
  UNIQUE (session_id, idempotency_key)
);
ALTER TABLE capture_asset ADD COLUMN IF NOT EXISTS validation_attempt uuid;
ALTER TABLE capture_asset ADD COLUMN IF NOT EXISTS validation_lease_expires_at timestamptz;
ALTER TABLE capture_asset ADD COLUMN IF NOT EXISTS staging_deleted_at timestamptz;
ALTER TABLE capture_asset ADD COLUMN IF NOT EXISTS blob_deleted_at timestamptz;
ALTER TABLE capture_asset ADD COLUMN IF NOT EXISTS cleanup_code varchar(80);
ALTER TABLE capture_asset ADD COLUMN IF NOT EXISTS cleanup_attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE capture_asset ADD COLUMN IF NOT EXISTS cleanup_next_attempt_at timestamptz;
ALTER TABLE capture_asset ADD COLUMN IF NOT EXISTS cleanup_last_error_category varchar(80);
ALTER TABLE capture_asset DROP CONSTRAINT IF EXISTS capture_asset_cleanup_attempt_count_check;
ALTER TABLE capture_asset ADD CONSTRAINT capture_asset_cleanup_attempt_count_check
  CHECK (cleanup_attempt_count >= 0);
-- Multiple capture attempts with identical same-case bytes deliberately link to
-- one canonical Evidence row. PostgreSQL generated this name for the earlier
-- inline UNIQUE declaration; remove it replay-safely before dedupe is exercised.
ALTER TABLE capture_asset DROP CONSTRAINT IF EXISTS capture_asset_evidence_id_key;
CREATE INDEX IF NOT EXISTS ix_capture_asset_progress ON capture_asset (session_id, shot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_capture_asset_validation_lease
  ON capture_asset (validation_lease_expires_at) WHERE state = 'validating';
DROP INDEX IF EXISTS ix_capture_asset_cleanup;
CREATE INDEX ix_capture_asset_cleanup
  ON capture_asset (cleanup_next_attempt_at, updated_at) WHERE blob_deleted_at IS NULL;
DROP INDEX IF EXISTS uq_capture_asset_selected_nonrepeatable;
CREATE UNIQUE INDEX IF NOT EXISTS uq_capture_asset_selected_shot
  ON capture_asset (session_id, shot_id)
  WHERE selected = true AND state IN ('accepted','pending_review','materialised');
CREATE UNIQUE INDEX IF NOT EXISTS uq_evidence_capture_asset
  ON evidence (source_message_id) WHERE source_label = 'public_guided_capture';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'capture_session','capture_session_shot','capture_asset'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'p_' || t || '_rw') THEN
      EXECUTE format('CREATE POLICY p_%1$s_rw ON %1$I USING (current_setting(''app.role'', true) IN (''staff'',''admin'')) WITH CHECK (current_setting(''app.role'', true) IN (''staff'',''admin''))', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'p_' || t || '_no_delete') THEN
      EXECUTE format('CREATE POLICY p_%1$s_no_delete ON %1$I AS RESTRICTIVE FOR DELETE USING (current_setting(''app.role'', true) = ''admin'')', t);
    END IF;
  END LOOP;
  EXECUTE 'ALTER TABLE capture_session_resume_token ENABLE ROW LEVEL SECURITY;';
  EXECUTE 'ALTER TABLE capture_session_resume_token FORCE ROW LEVEL SECURITY;';
  EXECUTE 'DROP POLICY IF EXISTS p_capture_session_resume_token_no_delete ON capture_session_resume_token;';
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'capture_session_resume_token'
       AND policyname = 'p_capture_session_resume_token_rw'
  ) THEN
    EXECUTE 'CREATE POLICY p_capture_session_resume_token_rw ON capture_session_resume_token USING (current_setting(''app.role'', true) IN (''staff'',''admin'')) WITH CHECK (current_setting(''app.role'', true) IN (''staff'',''admin''))';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE ON capture_session, capture_session_resume_token,
      capture_session_shot, capture_asset TO cespk_app;
    GRANT DELETE ON capture_session_resume_token TO cespk_app;
  END IF;
END $$;

COMMIT;
