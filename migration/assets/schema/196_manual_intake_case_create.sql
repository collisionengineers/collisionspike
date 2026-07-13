-- =============================================================================
-- 196_manual_intake_case_create.sql -- resumable Manual Intake case + source batch
-- -----------------------------------------------------------------------------
-- One authenticated staff operation owns exactly one case. A response-loss retry
-- returns that case; the expected canonical evidence upload remains a readiness
-- blocker until every selected file has a confirmed evidence identity.
-- =============================================================================
BEGIN;

CREATE TABLE manual_intake_case_create_operation (
  idempotency_key       varchar(128) PRIMARY KEY,
  actor                 varchar(320) NOT NULL,
  request_hash          char(64) NOT NULL CONSTRAINT ck_manual_intake_create_request_hash
                        CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  case_id               uuid REFERENCES case_(id) ON DELETE SET NULL,
  upload_idempotency_key varchar(128) UNIQUE,
  expected_file_count   integer NOT NULL DEFAULT 0
                        CONSTRAINT ck_manual_intake_create_file_count CHECK (
    expected_file_count >= 0 AND expected_file_count <= 20
  ),
  evidence_completed_at timestamptz,
  instruction_file_index integer,
  side_effects_completed_at timestamptz,
  response_loss_recovery_audited_at timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_manual_intake_create_upload_binding CHECK (
    (expected_file_count = 0 AND upload_idempotency_key IS NULL) OR
    (expected_file_count > 0 AND upload_idempotency_key IS NOT NULL)
  ),
  CONSTRAINT ck_manual_intake_create_instruction_index CHECK (
    instruction_file_index IS NULL OR
    (instruction_file_index >= 0 AND instruction_file_index < expected_file_count)
  )
);

CREATE INDEX ix_manual_intake_case_create_pending
  ON manual_intake_case_create_operation (case_id, created_at)
  WHERE expected_file_count > 0 AND evidence_completed_at IS NULL;

CREATE INDEX ix_manual_intake_case_create_case
  ON manual_intake_case_create_operation (case_id, created_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE ON manual_intake_case_create_operation TO cespk_app;
  END IF;
END $$;

COMMIT;
