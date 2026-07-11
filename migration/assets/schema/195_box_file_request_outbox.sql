-- Durable intent for one Box File Request per active case. The remote copy is
-- deliberately outside the database transaction; the lease + generation make a
-- crash between the Box response and the case stamp safely replayable.
BEGIN;

CREATE TABLE box_file_request_outbox (
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

CREATE INDEX ix_box_file_request_outbox_pending
  ON box_file_request_outbox (next_attempt_at, requested_at, case_id)
  WHERE requested_generation > completed_generation;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE ON box_file_request_outbox TO cespk_app;
  END IF;
END $$;

COMMIT;
