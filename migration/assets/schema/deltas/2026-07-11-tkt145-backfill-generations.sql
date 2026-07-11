-- TKT-145 generation-safe recovery completion and outcome reporting.
BEGIN;

ALTER TABLE inbound_email
  ADD COLUMN IF NOT EXISTS evidence_backfill_completed_generation integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS evidence_backfill_completed_result jsonb,
  ADD COLUMN IF NOT EXISTS evidence_backfill_reported_generation integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS evidence_backfill_completed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ck_inbound_email_evidence_backfill_progress_generations'
       AND conrelid = 'inbound_email'::regclass
  ) THEN
    ALTER TABLE inbound_email
      ADD CONSTRAINT ck_inbound_email_evidence_backfill_progress_generations
      CHECK (
        evidence_backfill_completed_generation >= 0 AND
        evidence_backfill_reported_generation >= 0 AND
        evidence_backfill_completed_generation <= evidence_backfill_requested_generation AND
        evidence_backfill_reported_generation <= evidence_backfill_requested_generation
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ck_inbound_email_evidence_backfill_completed_result'
       AND conrelid = 'inbound_email'::regclass
  ) THEN
    ALTER TABLE inbound_email
      ADD CONSTRAINT ck_inbound_email_evidence_backfill_completed_result
      CHECK (
        (evidence_backfill_completed_generation = 0 AND evidence_backfill_completed_result IS NULL) OR (
          evidence_backfill_completed_generation > 0 AND
          evidence_backfill_completed_result IS NOT NULL AND
          jsonb_typeof(evidence_backfill_completed_result) = 'object' AND
          evidence_backfill_completed_result->>'outcome' IN ('completed','partial')
        )
      );
  END IF;
END $$;

COMMIT;
