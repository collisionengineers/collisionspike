-- =============================================================================
-- TKT-089 durable archive-mirror outbox (idempotent live-apply delta).
-- Apply before the API/orchestration deployment that writes and drains this table.
-- Canonical fresh-build counterparts: ../190_archive_mirror_outbox.sql and
-- ../900_constraints.sql.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS archive_mirror_outbox (
  evidence_id           uuid PRIMARY KEY REFERENCES evidence(id) ON DELETE CASCADE,
  case_id               uuid NOT NULL REFERENCES case_(id) ON DELETE CASCADE,
  requested_generation  bigint NOT NULL DEFAULT 1,
  completed_generation  bigint NOT NULL DEFAULT 0,
  requested_at          timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz,
  attempt_count         integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at       timestamptz NOT NULL DEFAULT now(),
  last_attempt_at       timestamptz,
  last_error            varchar(200),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_archive_mirror_outbox_generations CHECK (
    requested_generation >= 1
    AND completed_generation >= 0
    AND completed_generation <= requested_generation
  )
);

ALTER TABLE archive_mirror_outbox
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error varchar(200);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ck_archive_mirror_outbox_attempt_count'
       AND conrelid = 'archive_mirror_outbox'::regclass
  ) THEN
    ALTER TABLE archive_mirror_outbox
      ADD CONSTRAINT ck_archive_mirror_outbox_attempt_count CHECK (attempt_count >= 0);
  END IF;
END $$;

DROP INDEX IF EXISTS ix_archive_mirror_outbox_pending;
CREATE INDEX ix_archive_mirror_outbox_pending
  ON archive_mirror_outbox (next_attempt_at, requested_at, evidence_id)
  WHERE requested_generation > completed_generation;

ALTER TABLE archive_mirror_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive_mirror_outbox FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'archive_mirror_outbox'
       AND policyname = 'p_archive_mirror_outbox_rw'
  ) THEN
    CREATE POLICY p_archive_mirror_outbox_rw ON archive_mirror_outbox
      USING (current_setting('app.role', true) IN ('staff','admin'))
      WITH CHECK (current_setting('app.role', true) IN ('staff','admin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'archive_mirror_outbox'
       AND policyname = 'p_archive_mirror_outbox_no_delete'
  ) THEN
    CREATE POLICY p_archive_mirror_outbox_no_delete ON archive_mirror_outbox
      AS RESTRICTIVE FOR DELETE
      USING (current_setting('app.role', true) = 'admin');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE ON archive_mirror_outbox TO cespk_app;
  END IF;
END $$;

COMMIT;

-- VERIFY (read-only):
-- SELECT evidence_id, requested_generation, completed_generation
--   FROM archive_mirror_outbox WHERE requested_generation > completed_generation;
-- SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--   WHERE relname = 'archive_mirror_outbox'; -- expect t | t
