-- TKT-156 — associate image chasers with the active archive upload request and
-- retain why a durable outbox generation replaced a missing/corrupt request.
BEGIN;

ALTER TABLE chaser
  ADD COLUMN IF NOT EXISTS box_file_request_id varchar(40),
  ADD COLUMN IF NOT EXISTS box_file_request_url varchar(400);

ALTER TABLE box_file_request_outbox
  ADD COLUMN IF NOT EXISTS repair_reason varchar(100);

CREATE INDEX IF NOT EXISTS ix_chaser_case_file_request_open
  ON chaser (case_id, box_file_request_id)
  WHERE box_file_request_id IS NOT NULL
    AND status_code IN (100000000, 100000001, 100000003);

COMMIT;
