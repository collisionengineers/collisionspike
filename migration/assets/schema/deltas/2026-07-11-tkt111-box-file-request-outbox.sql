-- Additive live migration for durable, replayable Box File Request copies.
BEGIN;

CREATE TABLE IF NOT EXISTS box_file_request_outbox (
  case_id                uuid PRIMARY KEY REFERENCES case_(id) ON DELETE CASCADE,
  folder_id              varchar(40) NOT NULL,
  template_id            varchar(40) NOT NULL,
  requested_generation   bigint NOT NULL DEFAULT 1,
  completed_generation   bigint NOT NULL DEFAULT 0,
  requested_at           timestamptz NOT NULL DEFAULT now(),
  completed_at           timestamptz,
  attempt_count          integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at        timestamptz NOT NULL DEFAULT now(),
  claim_token            uuid,
  claimed_at             timestamptz,
  claim_expires_at       timestamptz,
  last_error             varchar(200),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_box_file_request_outbox_generations CHECK (
    requested_generation >= 1
    AND completed_generation >= 0
    AND completed_generation <= requested_generation
  ),
  CONSTRAINT ck_box_file_request_outbox_ids CHECK (
    btrim(folder_id) <> '' AND btrim(template_id) <> ''
  )
);

CREATE INDEX IF NOT EXISTS ix_box_file_request_outbox_pending
  ON box_file_request_outbox (next_attempt_at, requested_at, case_id)
  WHERE requested_generation > completed_generation;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE ON box_file_request_outbox TO cespk_app;
  END IF;
  ALTER TABLE box_file_request_outbox ENABLE ROW LEVEL SECURITY;
  ALTER TABLE box_file_request_outbox FORCE ROW LEVEL SECURITY;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = current_schema()
       AND tablename = 'box_file_request_outbox'
       AND policyname = 'p_box_file_request_outbox_rw'
  ) THEN
    CREATE POLICY p_box_file_request_outbox_rw ON box_file_request_outbox
      USING (current_setting('app.role', true) IN ('staff','admin'))
      WITH CHECK (current_setting('app.role', true) IN ('staff','admin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = current_schema()
       AND tablename = 'box_file_request_outbox'
       AND policyname = 'p_box_file_request_outbox_no_delete'
  ) THEN
    CREATE POLICY p_box_file_request_outbox_no_delete ON box_file_request_outbox
      AS RESTRICTIVE FOR DELETE
      USING (current_setting('app.role', true) = 'admin');
  END IF;
END $$;

COMMIT;
