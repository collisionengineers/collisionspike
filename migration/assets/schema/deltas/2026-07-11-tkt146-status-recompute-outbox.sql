-- =============================================================================
-- TKT-146 — durable status recompute after a Box classification stamp
--
-- The evidence metadata update and requested-generation increment commit in one
-- Data API transaction. The orchestration sweep acknowledges only the generation
-- it successfully evaluated; a newer generation therefore remains pending.
-- =============================================================================
BEGIN;

ALTER TABLE case_
  ADD COLUMN IF NOT EXISTS status_recompute_requested_generation bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_recompute_completed_generation bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_recompute_requested_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'case_'::regclass
       AND conname = 'ck_case_status_recompute_generation'
  ) THEN
    ALTER TABLE case_
      ADD CONSTRAINT ck_case_status_recompute_generation CHECK (
        status_recompute_completed_generation <= status_recompute_requested_generation
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_case_status_recompute_pending
  ON case_ (status_recompute_requested_at, id)
  WHERE status_recompute_completed_generation < status_recompute_requested_generation;

-- Heal any pre-delta window in which classification committed but the old
-- best-effort status call was interrupted. Re-evaluation is idempotent; seed one
-- generation per affected case, not one per evidence row.
UPDATE case_ c
   SET status_recompute_requested_generation = 1,
       status_recompute_requested_at = now()
 WHERE c.status_recompute_requested_generation = 0
   AND c.status_recompute_completed_generation = 0
   AND EXISTS (
     SELECT 1
       FROM evidence e
      WHERE e.case_id = c.id
        AND e.box_file_id IS NOT NULL
        AND e.source_label LIKE 'box_upload%'
        AND e.kind_code = 100000000
        AND e.registration_visible IS NOT NULL
   );

COMMIT;
