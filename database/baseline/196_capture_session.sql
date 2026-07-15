-- =============================================================================
-- 196_capture_session.sql -- guided public evidence capture
-- -----------------------------------------------------------------------------
-- CollisionSpike owns the case-scoped invitation, immutable shot-plan snapshot,
-- staged upload attempts and final Evidence materialisation. Bootstrap secrets are
-- 256-bit random values; only SHA-256 hashes are stored. Public clients never see
-- case_id or evidence_id.
-- =============================================================================
BEGIN;

CREATE TABLE capture_session (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                  uuid NOT NULL REFERENCES case_(id) ON DELETE CASCADE,
  status                   varchar(16) NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open','complete','revoked','locked','expired')),
  shot_plan_id             varchar(64) NOT NULL
                           CHECK (shot_plan_id IN ('essential-v1','standard-exterior-v1')),
  shot_plan_label          varchar(120) NOT NULL,
  guidance_mode            varchar(16) NOT NULL DEFAULT 'advisory'
                           CHECK (guidance_mode IN ('off','shadow','advisory','enforced')),
  rules_version            varchar(64) NOT NULL,
  model_version            varchar(120),
  bootstrap_token_hash     char(64) NOT NULL UNIQUE
                           CHECK (bootstrap_token_hash ~ '^[0-9a-f]{64}$'),
  token_generation         integer NOT NULL DEFAULT 1 CHECK (token_generation >= 1),
  expires_at               timestamptz NOT NULL,
  created_by               varchar(320) NOT NULL,
  submitted_at             timestamptz,
  submit_idempotency_key   varchar(128),
  revoked_at               timestamptz,
  locked_at                timestamptz,
  expired_at               timestamptz,
  last_exchanged_at        timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_capture_session_case ON capture_session (case_id, created_at DESC);
CREATE INDEX ix_capture_session_expiry ON capture_session (expires_at) WHERE status = 'open';

CREATE TABLE capture_session_resume_token (
  token_hash               char(64) PRIMARY KEY
                           CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  session_id               uuid NOT NULL REFERENCES capture_session(id) ON DELETE CASCADE,
  token_generation         integer NOT NULL CHECK (token_generation >= 1),
  expires_at               timestamptz NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  last_used_at             timestamptz
);

CREATE INDEX ix_capture_resume_session
  ON capture_session_resume_token (session_id, created_at DESC, token_hash DESC);
CREATE INDEX ix_capture_resume_expiry
  ON capture_session_resume_token (expires_at);

CREATE TABLE capture_session_shot (
  session_id               uuid NOT NULL REFERENCES capture_session(id) ON DELETE CASCADE,
  shot_id                  varchar(64) NOT NULL,
  role                     varchar(40) NOT NULL,
  evidence_role            varchar(24) NOT NULL
                           CHECK (evidence_role IN ('overview','damage_closeup','additional','unknown')),
  label                    varchar(160) NOT NULL,
  prompt                   varchar(500) NOT NULL,
  required                 boolean NOT NULL,
  sequence                 integer NOT NULL CHECK (sequence >= 0),
  guidance_profile         jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (session_id, shot_id),
  UNIQUE (session_id, sequence)
);

CREATE TABLE capture_asset (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id               uuid NOT NULL REFERENCES capture_session(id) ON DELETE CASCADE,
  shot_id                  varchar(64) NOT NULL,
  idempotency_key          varchar(128) NOT NULL,
  state                    varchar(24) NOT NULL DEFAULT 'upload_pending'
                           CHECK (state IN (
                             'upload_pending','validating','accepted','pending_review',
                             'rejected','superseded','materialised'
                           )),
  selected                 boolean NOT NULL DEFAULT false,
  file_name                varchar(400) NOT NULL,
  declared_content_type    varchar(200) NOT NULL,
  declared_size_bytes      bigint NOT NULL CHECK (declared_size_bytes > 0),
  declared_sha256          char(64) NOT NULL CHECK (declared_sha256 ~ '^[0-9a-f]{64}$'),
  server_content_type      varchar(200),
  server_size_bytes        bigint,
  server_sha256            char(64) CHECK (server_sha256 IS NULL OR server_sha256 ~ '^[0-9a-f]{64}$'),
  width                    integer CHECK (width IS NULL OR width > 0),
  height                   integer CHECK (height IS NULL OR height > 0),
  blob_path                varchar(1000) NOT NULL UNIQUE,
  upload_expires_at        timestamptz NOT NULL,
  validation_attempt       uuid,
  validation_lease_expires_at timestamptz,
  validation_code          varchar(80),
  client_quality           jsonb,
  server_quality           jsonb,
  evidence_id              uuid REFERENCES evidence(id) ON DELETE SET NULL,
  materialised_at          timestamptz,
  staging_deleted_at       timestamptz,
  blob_deleted_at          timestamptz,
  cleanup_code             varchar(80),
  cleanup_attempt_count    integer NOT NULL DEFAULT 0,
  cleanup_next_attempt_at  timestamptz,
  cleanup_last_error_category varchar(80),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT capture_asset_cleanup_attempt_count_check CHECK (cleanup_attempt_count >= 0),
  FOREIGN KEY (session_id, shot_id)
    REFERENCES capture_session_shot(session_id, shot_id) ON DELETE CASCADE,
  UNIQUE (session_id, idempotency_key)
);

CREATE INDEX ix_capture_asset_progress
  ON capture_asset (session_id, shot_id, created_at DESC);
CREATE INDEX ix_capture_asset_validation_lease
  ON capture_asset (validation_lease_expires_at)
  WHERE state = 'validating';
CREATE INDEX ix_capture_asset_cleanup
  ON capture_asset (cleanup_next_attempt_at, updated_at)
  WHERE blob_deleted_at IS NULL;
CREATE UNIQUE INDEX uq_capture_asset_selected_shot
  ON capture_asset (session_id, shot_id)
  WHERE selected = true AND state IN ('accepted','pending_review','materialised');

CREATE UNIQUE INDEX uq_evidence_capture_asset
  ON evidence (source_message_id)
  WHERE source_label = 'public_guided_capture';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE ON capture_session TO cespk_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON capture_session_resume_token TO cespk_app;
    GRANT SELECT, INSERT, UPDATE ON capture_session_shot TO cespk_app;
    GRANT SELECT, INSERT, UPDATE ON capture_asset TO cespk_app;
  END IF;
END $$;

COMMIT;
