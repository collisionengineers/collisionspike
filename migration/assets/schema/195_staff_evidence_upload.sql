-- =============================================================================
-- 195_staff_evidence_upload.sql -- target-bound idempotency for staff uploads
-- -----------------------------------------------------------------------------
-- One browser upload attempt owns one opaque key. The key is bound to the exact
-- case, staff identity, source surface and ordered file manifest BEFORE any Blob
-- write. Replays of that exact batch are safe; reusing the key for another case or
-- different bytes is refused.
-- =============================================================================
BEGIN;

CREATE TABLE staff_evidence_upload (
  idempotency_key  varchar(128) PRIMARY KEY,
  case_id          uuid NOT NULL REFERENCES case_(id) ON DELETE CASCADE,
  actor            varchar(320) NOT NULL,
  source           varchar(40) NOT NULL CONSTRAINT ck_staff_evidence_upload_source CHECK (
    source IN ('add_evidence', 'manual_intake', 'assistant_confirmed', 'legacy_upload', 'mcp_agent')
  ),
  registration     varchar(16),
  manifest_hash    char(64) NOT NULL CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
  attempt_count    integer NOT NULL DEFAULT 0
                     CONSTRAINT ck_staff_evidence_upload_attempt_count CHECK (attempt_count >= 0),
  last_attempt_at  timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- One durable owner record per selected file bridges the Blob write and the
-- evidence transaction. Bytes are written only while this row owns an upload
-- lease. If the later transaction cannot commit, the exact path remains
-- discoverable as cleanup_pending until the durable orchestration sweep deletes
-- it. Every upload claim replaces blob_path with a claim-token-specific generation,
-- so stale cleanup can never delete a later retry's winning bytes.
CREATE TABLE staff_evidence_upload_item (
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

CREATE INDEX ix_staff_evidence_upload_item_cleanup
  ON staff_evidence_upload_item (cleanup_next_attempt_at, created_at)
  WHERE state = 'cleanup_pending';

-- Generated staff item identities are globally unique. The partial predicate
-- deliberately leaves every email/Box/intake source_message_id lane untouched.
CREATE UNIQUE INDEX uq_evidence_staff_upload_item
  ON evidence (source_message_id)
  WHERE source_label IN (
    'staff_add_evidence',
    'staff_manual_intake',
    'staff_assistant_confirmed',
    'staff_legacy_upload',
    'agent_image_ingest'
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE ON staff_evidence_upload TO cespk_app;
    GRANT SELECT, INSERT, UPDATE ON staff_evidence_upload_item TO cespk_app;
  END IF;
END $$;

COMMIT;
