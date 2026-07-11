-- =============================================================================
-- 190_archive_mirror_outbox.sql  -- durable staff-requested archive mirroring
-- -----------------------------------------------------------------------------
-- A staff reversal from excluded -> included can make a blob-backed evidence row
-- archive-eligible after intake's one-shot mirror already ran. This generation
-- outbox records that durable work in the SAME transaction as the review update.
-- The eternal orchestration monitor acknowledges a generation only after the
-- evidence row itself is stamped with box_file_id (or is no longer eligible).
-- RLS policies are added by 900_constraints.sql, applied last.
-- =============================================================================
BEGIN;

CREATE TABLE archive_mirror_outbox (
  evidence_id           uuid PRIMARY KEY REFERENCES evidence(id) ON DELETE CASCADE,
  case_id               uuid NOT NULL REFERENCES case_(id) ON DELETE CASCADE,
  requested_generation  bigint NOT NULL DEFAULT 1,
  completed_generation  bigint NOT NULL DEFAULT 0,
  requested_at          timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_archive_mirror_outbox_generations CHECK (
    requested_generation >= 1
    AND completed_generation >= 0
    AND completed_generation <= requested_generation
  )
);

CREATE INDEX ix_archive_mirror_outbox_pending
  ON archive_mirror_outbox (requested_at, evidence_id)
  WHERE requested_generation > completed_generation;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE ON archive_mirror_outbox TO cespk_app;
  END IF;
END $$;

COMMIT;
