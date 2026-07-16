-- ADR-0020: durable provider-scoped request replay and content binding.
BEGIN;

CREATE TABLE IF NOT EXISTS provider_intake_operation (
  work_provider_id uuid NOT NULL REFERENCES work_provider(id) ON DELETE CASCADE,
  idempotency_key varchar(128) NOT NULL,
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  case_id uuid REFERENCES case_(id) ON DELETE SET NULL,
  case_po varchar(80),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (work_provider_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS ix_provider_intake_operation_case
  ON provider_intake_operation (case_id);

ALTER TABLE provider_intake_operation ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_intake_operation FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_provider_intake_operation_rw ON provider_intake_operation;
CREATE POLICY p_provider_intake_operation_rw ON provider_intake_operation
  USING (current_setting('app.role', true) IN ('staff','admin'))
  WITH CHECK (current_setting('app.role', true) IN ('staff','admin'));
DROP POLICY IF EXISTS p_provider_intake_operation_no_delete ON provider_intake_operation;
CREATE POLICY p_provider_intake_operation_no_delete ON provider_intake_operation AS RESTRICTIVE FOR DELETE
  USING (current_setting('app.role', true) = 'admin');

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE ON provider_intake_operation TO cespk_app;
  END IF;
END $$;

COMMIT;
