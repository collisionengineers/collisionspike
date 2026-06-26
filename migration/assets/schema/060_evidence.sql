-- =============================================================================
-- 060_evidence.sql  --  cr1bd_evidence  (M1-live; one row per attachment/artifact)
-- BYTES LIVE OFF-ROW: the Dataverse File column (cr1bd_filebytes) is intentionally
-- NOT translated -- bytes stay in Azure Blob (cespkevidstdev01) referenced by
-- storage_path. case_id FK (ON DELETE CASCADE) is in 900_constraints.sql.
-- =============================================================================
BEGIN;

CREATE TABLE evidence (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name             varchar(400) NOT NULL,    -- primaryColumn cr1bd_filename (required)
  case_id               uuid NOT NULL,            -- -> case_ (parent, cascade); FK in 900
  kind_code             integer NOT NULL REFERENCES choice_evidence_kind(code),
  image_role_code       integer NOT NULL DEFAULT 100000003 REFERENCES choice_image_role(code), -- unknown
  registration_visible  boolean,                  -- tri-state: NULL = OCR not run / unknown
  accepted_for_eva      boolean NOT NULL DEFAULT true,
  excluded              boolean NOT NULL DEFAULT false,
  exclusion_reason      varchar(400),
  sequence_index        integer CHECK (sequence_index IS NULL OR sequence_index >= 0),
  sha256                varchar(80),              -- within-message dedup
  content_type          varchar(200),
  size_bytes            bigint,
  storage_path          varchar(1000),            -- Blob reference; NEVER inline bytes
  source_message_id     varchar(400),
  source_label          varchar(400),
  box_file_id           varchar(40),              -- Box correlation only (not a dedup key)
  box_file_url          varchar(400),             -- format:Url
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- exclusion_reason required when excluded=true (schema invariant)
  CONSTRAINT ck_evidence_exclusion_reason
    CHECK (NOT excluded OR (exclusion_reason IS NOT NULL AND length(btrim(exclusion_reason)) > 0))
);

COMMENT ON TABLE evidence IS 'cr1bd_evidence -- per-artifact row; bytes off-row in Blob (storage_path). Dataverse File column not translated.';

CREATE INDEX ix_evidence_case_id ON evidence (case_id);

COMMIT;
