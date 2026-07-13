-- =============================================================================
-- 205_evidence_deletion.sql -- explicit single-image deletion intent (TKT-160)
-- -----------------------------------------------------------------------------
-- One durable tombstone per evidence id. It snapshots storage identities before
-- any external deletion, retains per-store outcomes for idempotent recovery, and
-- remains after the active evidence row is removed. Image bytes never enter this
-- table. Automatic source replay consults these exact identities; SHA-256 alone is
-- deliberately not a tombstone key so a later explicit same-byte upload is allowed.
-- =============================================================================
BEGIN;

CREATE TABLE evidence_deletion (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id           uuid NOT NULL UNIQUE,
  case_id               uuid NOT NULL REFERENCES case_(id) ON DELETE CASCADE,
  file_name             varchar(400) NOT NULL,
  kind_code             integer NOT NULL REFERENCES choice_evidence_kind(code),
  storage_path          varchar(1000),
  source_message_id     varchar(400),
  box_file_id           varchar(40),
  box_folder_id         varchar(40),
  requested_by          varchar(320) NOT NULL,
  state                 varchar(24) NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','retry_needed','ready_to_finalize','completed')),
  blob_outcome          varchar(20) NOT NULL
    CHECK (blob_outcome IN ('pending','not_required','deleted','missing','failed')),
  box_outcome           varchar(20) NOT NULL
    CHECK (box_outcome IN ('pending','not_required','deleted','missing','failed')),
  attempt_count         integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  claim_token           uuid,
  claim_expires_at      timestamptz,
  last_failure_code     varchar(80),
  requested_at          timestamptz NOT NULL DEFAULT now(),
  last_attempt_at       timestamptz,
  completed_at          timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_evidence_deletion_box_identity CHECK (
    box_file_id IS NULL OR (box_folder_id IS NOT NULL AND length(btrim(box_folder_id)) > 0)
  )
);

ALTER TABLE evidence ADD CONSTRAINT fk_evidence_deletion_operation
  FOREIGN KEY (deletion_operation_id) REFERENCES evidence_deletion(id) ON DELETE SET NULL;

CREATE INDEX ix_evidence_deletion_replay_storage
  ON evidence_deletion (case_id, storage_path) WHERE storage_path IS NOT NULL;
CREATE INDEX ix_evidence_deletion_replay_box
  ON evidence_deletion (case_id, box_file_id) WHERE box_file_id IS NOT NULL;
CREATE INDEX ix_evidence_deletion_retry
  ON evidence_deletion (state, updated_at, id) WHERE state <> 'completed';

CREATE OR REPLACE FUNCTION complete_evidence_deletion(
  p_operation_id uuid,
  p_claim_token uuid
) RETURNS TABLE (case_id uuid, evidence_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_case_id uuid;
  v_evidence_id uuid;
  v_image_kind integer;
BEGIN
  SELECT code INTO v_image_kind
    FROM public.choice_evidence_kind WHERE name = 'image';

  SELECT d.case_id, d.evidence_id
    INTO v_case_id, v_evidence_id
    FROM public.evidence_deletion d
    JOIN public.evidence e
      ON e.id = d.evidence_id AND e.case_id = d.case_id
    JOIN public.case_ c ON c.id = d.case_id
   WHERE d.id = p_operation_id
     AND d.claim_token = p_claim_token
     AND d.state IN ('pending','retry_needed')
     AND d.blob_outcome IN ('deleted','missing','not_required')
     AND d.box_outcome IN ('deleted','missing','not_required')
     AND d.kind_code = v_image_kind
     AND e.kind_code = v_image_kind
     AND e.deletion_operation_id = d.id
     AND e.storage_path IS NOT DISTINCT FROM d.storage_path
     AND e.source_message_id IS NOT DISTINCT FROM d.source_message_id
     AND e.box_file_id IS NOT DISTINCT FROM d.box_file_id
     AND c.box_folder_id IS NOT DISTINCT FROM d.box_folder_id
   FOR UPDATE OF d, e, c;

  IF v_evidence_id IS NULL THEN
    RAISE EXCEPTION 'evidence deletion finalization guard failed' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.evidence_deletion
     SET state = 'ready_to_finalize', updated_at = now()
   WHERE id = p_operation_id AND claim_token = p_claim_token;

  DELETE FROM public.evidence
   WHERE id = v_evidence_id
     AND case_id = v_case_id
     AND deletion_operation_id = p_operation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'evidence deletion target disappeared' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.evidence_deletion
     SET state = 'completed', completed_at = now(), claim_token = NULL,
         claim_expires_at = NULL, last_failure_code = NULL, updated_at = now()
   WHERE id = p_operation_id;

  RETURN QUERY SELECT v_case_id, v_evidence_id;
END;
$$;

REVOKE ALL ON FUNCTION complete_evidence_deletion(uuid, uuid) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE ON evidence_deletion TO cespk_app;
    GRANT EXECUTE ON FUNCTION complete_evidence_deletion(uuid, uuid) TO cespk_app;
  END IF;
END $$;

COMMIT;
