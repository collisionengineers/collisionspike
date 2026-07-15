-- Registration-keyed archive holding ledger (TKT-034).
BEGIN;

CREATE TABLE archive_holding_folder (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_vrm        varchar(16) NOT NULL,
  root_folder_id        varchar(40) NOT NULL,
  box_folder_id         varchar(40) NOT NULL UNIQUE,
  box_folder_url        varchar(400),
  state                 varchar(24) NOT NULL DEFAULT 'open' CHECK (
    state IN ('open','adopting','ambiguous','transferred','adopted','failed')
  ),
  adoption_mode         varchar(16) CHECK (adoption_mode IS NULL OR adoption_mode IN ('rename','merge')),
  adopted_case_id       uuid REFERENCES case_(id) ON DELETE SET NULL,
  canonical_folder_id   varchar(40),
  candidate_case_ids    jsonb NOT NULL DEFAULT '[]'::jsonb,
  candidate_folder_ids  jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolved_case_id      uuid REFERENCES case_(id) ON DELETE SET NULL,
  resolved_by           varchar(400),
  resolved_at           timestamptz,
  claim_token           uuid,
  claim_expires_at      timestamptz,
  attempt_count         integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at       timestamptz NOT NULL DEFAULT now(),
  last_error            varchar(400),
  retired_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_archive_holding_vrm CHECK (normalized_vrm ~ '^[A-Z0-9]{2,16}$')
);

CREATE UNIQUE INDEX uq_archive_holding_active_vrm
  ON archive_holding_folder (root_folder_id, normalized_vrm)
  WHERE state <> 'adopted';

CREATE TABLE archive_holding_intake (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_folder_id     uuid NOT NULL REFERENCES archive_holding_folder(id) ON DELETE CASCADE,
  source_message_id     varchar(400) NOT NULL UNIQUE,
  inbound_email_id      uuid REFERENCES inbound_email(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (holding_folder_id, source_message_id)
);

CREATE TABLE archive_holding_file (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_folder_id     uuid NOT NULL REFERENCES archive_holding_folder(id) ON DELETE CASCADE,
  source_message_id     varchar(400) NOT NULL,
  file_name             varchar(400) NOT NULL,
  content_type          varchar(200) NOT NULL,
  size_bytes            bigint NOT NULL CHECK (size_bytes >= 0),
  blob_path             varchar(1000) NOT NULL,
  sha256                char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  box_file_id           varchar(40),
  box_file_url          varchar(400),
  box_sha1              char(40),
  canonical_box_file_id varchar(40),
  canonical_box_file_url varchar(400),
  state                 varchar(24) NOT NULL DEFAULT 'reserved' CHECK (
    state IN ('reserved','uploading','uploaded','moved','deduplicated','adopted','failed')
  ),
  claim_token           uuid,
  claim_expires_at      timestamptz,
  attempt_count         integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at       timestamptz NOT NULL DEFAULT now(),
  last_error            varchar(400),
  evidence_id           uuid REFERENCES evidence(id) ON DELETE SET NULL,
  source_retired        boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (holding_folder_id, sha256)
);

CREATE INDEX ix_archive_holding_folder_state ON archive_holding_folder (state, updated_at);
CREATE INDEX ix_archive_holding_file_pending ON archive_holding_file (holding_folder_id, state, created_at);
CREATE INDEX ix_archive_holding_folder_recovery ON archive_holding_folder (next_attempt_at, updated_at)
  WHERE state <> 'adopted';
CREATE INDEX ix_archive_holding_file_recovery ON archive_holding_file (next_attempt_at, created_at)
  WHERE box_file_id IS NULL;

-- A source email's case link is authoritative identity. Freeze that link only
-- while remote bytes are moving; finalization transitions the holding to
-- transferred in its own transaction before performing the canonical link.
CREATE OR REPLACE FUNCTION guard_inbound_archive_holding_link_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.case_id IS DISTINCT FROM OLD.case_id AND EXISTS (
    SELECT 1 FROM archive_holding_intake i
    JOIN archive_holding_folder h ON h.id=i.holding_folder_id
    WHERE i.source_message_id=OLD.source_message_id
      AND h.state='adopting' AND h.claim_token IS NOT NULL AND h.claim_expires_at>now()
  ) THEN
    RAISE EXCEPTION 'source email link is locked while registration images are being filed'
      USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_inbound_archive_holding_link_guard
BEFORE UPDATE OF case_id ON inbound_email
FOR EACH ROW EXECUTE FUNCTION guard_inbound_archive_holding_link_change();

-- Arrival intent that cannot safely join a folder while that folder has a live
-- remote adoption lease. Blob manifests make the later registration replayable.
CREATE TABLE archive_holding_deferred_intake (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_message_id     varchar(400) NOT NULL UNIQUE,
  normalized_vrm        varchar(16) NOT NULL CHECK (normalized_vrm ~ '^[A-Z0-9]{2,16}$'),
  root_folder_id        varchar(40) NOT NULL,
  file_manifest         jsonb NOT NULL CHECK (jsonb_typeof(file_manifest) = 'array'),
  state                 varchar(24) NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','failed','completed')),
  claim_token           uuid,
  claim_expires_at      timestamptz,
  attempt_count         integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at       timestamptz NOT NULL DEFAULT now(),
  last_error            varchar(400),
  completed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_archive_holding_deferred_pending ON archive_holding_deferred_intake (state, next_attempt_at, created_at);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE ON archive_holding_folder, archive_holding_intake, archive_holding_file,
      archive_holding_deferred_intake TO cespk_app;
  END IF;
END $$;

COMMIT;
