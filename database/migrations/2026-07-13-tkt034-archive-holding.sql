-- TKT-034 live delta. Safe to replay; apply before API/orchestration deployment.
BEGIN;

ALTER TABLE case_ ADD COLUMN IF NOT EXISTS archive_holding_pending boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS archive_holding_folder (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), normalized_vrm varchar(16) NOT NULL CHECK (normalized_vrm ~ '^[A-Z0-9]{2,16}$'),
  root_folder_id varchar(40) NOT NULL, box_folder_id varchar(40) NOT NULL UNIQUE,
  box_folder_url varchar(400), state varchar(24) NOT NULL DEFAULT 'open' CHECK (state IN ('open','adopting','ambiguous','transferred','adopted','failed')),
  adoption_mode varchar(16) CHECK (adoption_mode IS NULL OR adoption_mode IN ('rename','merge')), adopted_case_id uuid REFERENCES case_(id) ON DELETE SET NULL,
  canonical_folder_id varchar(40), candidate_case_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  candidate_folder_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolved_case_id uuid REFERENCES case_(id) ON DELETE SET NULL, resolved_by varchar(400), resolved_at timestamptz,
  claim_token uuid, claim_expires_at timestamptz, attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(), last_error varchar(400), retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE archive_holding_folder ADD COLUMN IF NOT EXISTS candidate_folder_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE archive_holding_folder ADD COLUMN IF NOT EXISTS resolved_case_id uuid REFERENCES case_(id) ON DELETE SET NULL;
ALTER TABLE archive_holding_folder ADD COLUMN IF NOT EXISTS resolved_by varchar(400);
ALTER TABLE archive_holding_folder ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE archive_holding_folder ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE archive_holding_folder DROP CONSTRAINT IF EXISTS archive_holding_folder_root_folder_id_normalized_vrm_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_archive_holding_active_vrm
  ON archive_holding_folder (root_folder_id, normalized_vrm) WHERE state <> 'adopted';
CREATE TABLE IF NOT EXISTS archive_holding_intake (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), holding_folder_id uuid NOT NULL REFERENCES archive_holding_folder(id) ON DELETE CASCADE,
  source_message_id varchar(400) NOT NULL UNIQUE, inbound_email_id uuid REFERENCES inbound_email(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (holding_folder_id, source_message_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_archive_holding_intake_message ON archive_holding_intake(source_message_id);

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
DROP TRIGGER IF EXISTS trg_inbound_archive_holding_link_guard ON inbound_email;
CREATE TRIGGER trg_inbound_archive_holding_link_guard BEFORE UPDATE OF case_id ON inbound_email
FOR EACH ROW EXECUTE FUNCTION guard_inbound_archive_holding_link_change();
CREATE TABLE IF NOT EXISTS archive_holding_file (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), holding_folder_id uuid NOT NULL REFERENCES archive_holding_folder(id) ON DELETE CASCADE,
  source_message_id varchar(400) NOT NULL, file_name varchar(400) NOT NULL, content_type varchar(200) NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0), blob_path varchar(1000) NOT NULL, sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  box_file_id varchar(40), box_file_url varchar(400), box_sha1 char(40), canonical_box_file_id varchar(40),
  canonical_box_file_url varchar(400), state varchar(24) NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','uploading','uploaded','moved','deduplicated','adopted','failed')), claim_token uuid,
  claim_expires_at timestamptz, attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(), last_error varchar(400),
  evidence_id uuid REFERENCES evidence(id) ON DELETE SET NULL, source_retired boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (holding_folder_id, sha256)
);
ALTER TABLE archive_holding_file ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS ix_archive_holding_folder_recovery ON archive_holding_folder (next_attempt_at,updated_at)
  WHERE state <> 'adopted';
CREATE INDEX IF NOT EXISTS ix_archive_holding_file_recovery ON archive_holding_file (next_attempt_at,created_at)
  WHERE box_file_id IS NULL;
CREATE TABLE IF NOT EXISTS archive_holding_deferred_intake (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_message_id varchar(400) NOT NULL UNIQUE,
  normalized_vrm varchar(16) NOT NULL CHECK (normalized_vrm ~ '^[A-Z0-9]{2,16}$'), root_folder_id varchar(40) NOT NULL,
  file_manifest jsonb NOT NULL CHECK (jsonb_typeof(file_manifest)='array'), state varchar(24) NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','processing','failed','completed')), claim_token uuid, claim_expires_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count>=0), next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error varchar(400), completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE archive_holding_deferred_intake ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
DROP INDEX IF EXISTS ix_archive_holding_deferred_pending;
CREATE INDEX IF NOT EXISTS ix_archive_holding_deferred_pending
  ON archive_holding_deferred_intake (state,next_attempt_at,created_at);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['archive_holding_folder','archive_holding_intake','archive_holding_file','archive_holding_deferred_intake'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=t AND policyname='p_'||t||'_rw') THEN
      EXECUTE format('CREATE POLICY p_%1$s_rw ON %1$I USING (current_setting(''app.role'', true) IN (''staff'',''admin'')) WITH CHECK (current_setting(''app.role'', true) IN (''staff'',''admin''))', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=t AND policyname='p_'||t||'_no_delete') THEN
      EXECUTE format('CREATE POLICY p_%1$s_no_delete ON %1$I AS RESTRICTIVE FOR DELETE USING (current_setting(''app.role'', true) = ''admin'')', t);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE ON archive_holding_folder, archive_holding_intake, archive_holding_file,
      archive_holding_deferred_intake TO cespk_app;
  END IF;
END $$;
COMMIT;
