-- TKT-145: make terminal evidence-backfill reports replay-idempotent.
-- Safe to re-run against both the live database and a schema-created database.
BEGIN;

ALTER TABLE inbound_email
  ADD COLUMN IF NOT EXISTS evidence_backfill_report_outcome varchar(20),
  ADD COLUMN IF NOT EXISTS evidence_backfill_reported_at timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_backfill_requested_generation integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS evidence_backfill_enqueued_generation integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS evidence_backfill_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_backfill_enqueued_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'ck_inbound_email_evidence_backfill_report_outcome'
       AND conrelid = 'inbound_email'::regclass
  ) THEN
    ALTER TABLE inbound_email
      ADD CONSTRAINT ck_inbound_email_evidence_backfill_report_outcome
      CHECK (
        evidence_backfill_report_outcome IS NULL OR
        evidence_backfill_report_outcome IN ('completed','partial','failed')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ck_inbound_email_evidence_backfill_request_generations'
       AND conrelid = 'inbound_email'::regclass
  ) THEN
    ALTER TABLE inbound_email
      ADD CONSTRAINT ck_inbound_email_evidence_backfill_request_generations
      CHECK (
        evidence_backfill_requested_generation >= 0 AND
        evidence_backfill_enqueued_generation >= 0 AND
        evidence_backfill_enqueued_generation <= evidence_backfill_requested_generation
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_inbound_email_evidence_backfill_pending
  ON inbound_email (evidence_backfill_requested_at, id)
  WHERE evidence_backfill_requested_generation > evidence_backfill_enqueued_generation;

COMMIT;
