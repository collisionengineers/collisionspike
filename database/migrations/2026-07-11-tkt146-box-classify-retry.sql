-- =============================================================================
-- TKT-146 regression: durable FILE.UPLOADED classification claims and retry state.
--
-- Apply before the API/orchestration build that uses the new claim protocol. This is
-- metadata only: no evidence row, Blob object, or Archive file is removed or excluded.
-- =============================================================================
BEGIN;

ALTER TABLE evidence
  ADD COLUMN IF NOT EXISTS box_classify_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS box_classify_next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS box_classify_claim_token uuid,
  ADD COLUMN IF NOT EXISTS box_classify_claim_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS box_classify_last_failure_code varchar(80),
  ADD COLUMN IF NOT EXISTS box_classify_dead_lettered_at timestamptz,
  ADD COLUMN IF NOT EXISTS box_classify_dead_letter_reason varchar(400);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'evidence'::regclass
       AND conname = 'ck_evidence_box_classify_attempt_count'
  ) THEN
    ALTER TABLE evidence
      ADD CONSTRAINT ck_evidence_box_classify_attempt_count
      CHECK (box_classify_attempt_count >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_evidence_box_classify_due
  ON evidence (box_classify_next_attempt_at, created_at DESC, id)
  WHERE box_file_id IS NOT NULL
    AND kind_code = 100000000
    AND image_role_code = 100000003
    AND registration_visible IS NULL
    AND excluded = false
    AND box_classify_dead_lettered_at IS NULL;

COMMIT;
