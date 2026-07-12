-- =============================================================================
-- TKT-166 -- resumable Manual Intake case creation + source-evidence readiness gate
-- Apply before the TKT-166 API and SPA release.
-- Fresh-build counterpart: ../196_manual_intake_case_create.sql.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS manual_intake_case_create_operation (
  idempotency_key        varchar(128) PRIMARY KEY,
  actor                  varchar(320) NOT NULL,
  request_hash           char(64) NOT NULL,
  case_id                uuid UNIQUE REFERENCES case_(id) ON DELETE SET NULL,
  upload_idempotency_key varchar(128) UNIQUE,
  expected_file_count    integer NOT NULL DEFAULT 0,
  evidence_completed_at  timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'manual_intake_case_create_operation'::regclass
       AND conname = 'ck_manual_intake_create_request_hash'
  ) THEN
    ALTER TABLE manual_intake_case_create_operation
      ADD CONSTRAINT ck_manual_intake_create_request_hash CHECK (
        request_hash ~ '^[0-9a-f]{64}$'
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'manual_intake_case_create_operation'::regclass
       AND conname = 'ck_manual_intake_create_file_count'
  ) THEN
    ALTER TABLE manual_intake_case_create_operation
      ADD CONSTRAINT ck_manual_intake_create_file_count CHECK (
        expected_file_count >= 0 AND expected_file_count <= 20
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'manual_intake_case_create_operation'::regclass
       AND conname = 'ck_manual_intake_create_upload_binding'
  ) THEN
    ALTER TABLE manual_intake_case_create_operation
      ADD CONSTRAINT ck_manual_intake_create_upload_binding CHECK (
        (expected_file_count = 0 AND upload_idempotency_key IS NULL) OR
        (expected_file_count > 0 AND upload_idempotency_key IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_manual_intake_case_create_pending
  ON manual_intake_case_create_operation (case_id, created_at)
  WHERE expected_file_count > 0 AND evidence_completed_at IS NULL;

ALTER TABLE manual_intake_case_create_operation ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_intake_case_create_operation FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'manual_intake_case_create_operation'
       AND policyname = 'p_manual_intake_case_create_operation_rw'
  ) THEN
    CREATE POLICY p_manual_intake_case_create_operation_rw
      ON manual_intake_case_create_operation
      USING (current_setting('app.role', true) IN ('staff','admin'))
      WITH CHECK (current_setting('app.role', true) IN ('staff','admin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'manual_intake_case_create_operation'
       AND policyname = 'p_manual_intake_case_create_operation_no_delete'
  ) THEN
    CREATE POLICY p_manual_intake_case_create_operation_no_delete
      ON manual_intake_case_create_operation AS RESTRICTIVE FOR DELETE
      USING (current_setting('app.role', true) = 'admin');
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE ON manual_intake_case_create_operation TO cespk_app;
  END IF;
END $$;

COMMIT;

-- Read-only verification:
-- SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--  WHERE relname = 'manual_intake_case_create_operation';
-- SELECT indexdef FROM pg_indexes
--  WHERE indexname = 'ix_manual_intake_case_create_pending';
