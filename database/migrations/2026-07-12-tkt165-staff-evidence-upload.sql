-- =============================================================================
-- TKT-165 -- target-bound, replay-safe staff evidence uploads (idempotent delta)
-- Apply before deploying the API/SPA/orchestration changes for TKT-165.
-- Fresh-build counterpart: ../195_staff_evidence_upload.sql.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS staff_evidence_upload (
  idempotency_key  varchar(128) PRIMARY KEY,
  case_id          uuid NOT NULL REFERENCES case_(id) ON DELETE CASCADE,
  actor            varchar(320) NOT NULL,
  source           varchar(40) NOT NULL,
  manifest_hash    char(64) NOT NULL,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  -- Recreate rather than merely IF-NOT-EXISTS so a partially rolled-out older
  -- definition gains the API-first legacy source on a safe delta replay.
  ALTER TABLE staff_evidence_upload
    DROP CONSTRAINT IF EXISTS ck_staff_evidence_upload_source;
  ALTER TABLE staff_evidence_upload
    DROP CONSTRAINT IF EXISTS staff_evidence_upload_source_check;
  ALTER TABLE staff_evidence_upload
    ADD CONSTRAINT ck_staff_evidence_upload_source CHECK (
      source IN ('add_evidence', 'manual_intake', 'assistant_confirmed', 'legacy_upload')
    );
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'staff_evidence_upload'::regclass
       AND conname = 'ck_staff_evidence_upload_manifest_hash'
  ) THEN
    ALTER TABLE staff_evidence_upload
      ADD CONSTRAINT ck_staff_evidence_upload_manifest_hash CHECK (
        manifest_hash ~ '^[0-9a-f]{64}$'
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS staff_evidence_upload_item (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key          varchar(128) NOT NULL
                            REFERENCES staff_evidence_upload(idempotency_key) ON DELETE CASCADE,
  item_index               integer NOT NULL CHECK (item_index >= 0),
  case_id                  uuid NOT NULL REFERENCES case_(id) ON DELETE CASCADE,
  sha256                   char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  file_name                varchar(400) NOT NULL,
  content_type             varchar(200) NOT NULL,
  blob_path                varchar(1000) NOT NULL UNIQUE,
  state                    varchar(24) NOT NULL DEFAULT 'reserved' CHECK (
    state IN ('reserved', 'uploading', 'complete', 'cleanup_pending', 'cleaned')
  ),
  evidence_id              uuid REFERENCES evidence(id) ON DELETE SET NULL,
  upload_claim_token       uuid,
  upload_claim_expires_at  timestamptz,
  cleanup_claim_token      uuid,
  cleanup_claim_expires_at timestamptz,
  cleanup_attempt_count    integer NOT NULL DEFAULT 0 CHECK (cleanup_attempt_count >= 0),
  cleanup_next_attempt_at  timestamptz,
  cleanup_last_error       varchar(400),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key, item_index)
);

CREATE INDEX IF NOT EXISTS ix_staff_evidence_upload_item_cleanup
  ON staff_evidence_upload_item (cleanup_next_attempt_at, created_at)
  WHERE state = 'cleanup_pending';

CREATE UNIQUE INDEX IF NOT EXISTS uq_evidence_staff_upload_item
  ON evidence (source_message_id)
  WHERE source_label IN (
    'staff_add_evidence',
    'staff_manual_intake',
    'staff_assistant_confirmed',
    'staff_legacy_upload'
  );

ALTER TABLE staff_evidence_upload ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_evidence_upload FORCE ROW LEVEL SECURITY;
ALTER TABLE staff_evidence_upload_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_evidence_upload_item FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'staff_evidence_upload'
       AND policyname = 'p_staff_evidence_upload_rw'
  ) THEN
    CREATE POLICY p_staff_evidence_upload_rw ON staff_evidence_upload
      USING (current_setting('app.role', true) IN ('staff','admin'))
      WITH CHECK (current_setting('app.role', true) IN ('staff','admin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'staff_evidence_upload'
       AND policyname = 'p_staff_evidence_upload_no_delete'
  ) THEN
    CREATE POLICY p_staff_evidence_upload_no_delete ON staff_evidence_upload
      AS RESTRICTIVE FOR DELETE
      USING (current_setting('app.role', true) = 'admin');
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE ON staff_evidence_upload TO cespk_app;
    GRANT SELECT, INSERT, UPDATE ON staff_evidence_upload_item TO cespk_app;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'staff_evidence_upload_item'
       AND policyname = 'p_staff_evidence_upload_item_rw'
  ) THEN
    CREATE POLICY p_staff_evidence_upload_item_rw ON staff_evidence_upload_item
      USING (current_setting('app.role', true) IN ('staff','admin'))
      WITH CHECK (current_setting('app.role', true) IN ('staff','admin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'staff_evidence_upload_item'
       AND policyname = 'p_staff_evidence_upload_item_no_delete'
  ) THEN
    CREATE POLICY p_staff_evidence_upload_item_no_delete ON staff_evidence_upload_item
      AS RESTRICTIVE FOR DELETE
      USING (current_setting('app.role', true) = 'admin');
  END IF;
END $$;

COMMIT;

-- Read-only verification:
-- SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--  WHERE relname IN ('staff_evidence_upload', 'staff_evidence_upload_item');
-- SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_evidence_staff_upload_item';
