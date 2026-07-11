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
  image_role_source     varchar(20) CHECK (image_role_source IS NULL OR image_role_source IN ('classifier','staff','provider','cleanup','legacy')),
  registration_visible  boolean,                  -- tri-state: NULL = OCR not run / unknown
  registration_visible_source varchar(20) CHECK (registration_visible_source IS NULL OR registration_visible_source IN ('classifier','staff','provider','cleanup','legacy')),
  accepted_for_eva      boolean NOT NULL DEFAULT true,
  accepted_for_eva_source varchar(20) CHECK (accepted_for_eva_source IS NULL OR accepted_for_eva_source IN ('classifier','staff','provider','cleanup','legacy')),
  excluded              boolean NOT NULL DEFAULT false,
  exclusion_reason      varchar(400),
  -- Source of the current include/exclude decision. Non-null is meaningful for both
  -- excluded=true (exclude) and excluded=false (an explicit include that retries must respect).
  exclusion_decision_source varchar(20) CHECK (exclusion_decision_source IS NULL OR exclusion_decision_source IN ('classifier','staff','provider','cleanup','legacy')),
  person_reflection     boolean NOT NULL DEFAULT false,   -- vision classifier saw a person's reflection (TKT-123; advisory)
  reflection_dismissed  boolean NOT NULL DEFAULT false,   -- reviewer dismissed the reflection warning (TKT-123)
  sequence_index        integer CHECK (sequence_index IS NULL OR sequence_index >= 0),
  sha256                varchar(80),              -- within-message dedup
  content_type          varchar(200),
  size_bytes            bigint,
  storage_path          varchar(1000),            -- Blob reference; NEVER inline bytes
  source_message_id     varchar(400),
  source_label          varchar(400),
  box_file_id           varchar(40),              -- Box correlation only (not a dedup key)
  box_file_url          varchar(400),             -- format:Url
  archive_mirror_decision_generation bigint NOT NULL DEFAULT 0,
  archive_mirror_claim_token uuid,
  archive_mirror_claimed_at timestamptz,
  archive_mirror_claim_expires_at timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- exclusion_reason required when excluded=true (schema invariant)
  CONSTRAINT ck_evidence_exclusion_reason
    CHECK (NOT excluded OR (exclusion_reason IS NOT NULL AND length(btrim(exclusion_reason)) > 0))
);

COMMENT ON TABLE evidence IS 'cr1bd_evidence -- per-artifact row; bytes off-row in Blob (storage_path). Dataverse File column not translated.';

CREATE INDEX ix_evidence_case_id ON evidence (case_id);
CREATE INDEX ix_evidence_case_classifier_review
  ON evidence (case_id, sequence_index, created_at)
  WHERE kind_code = 100000000
    AND excluded
    AND exclusion_decision_source = 'classifier';

COMMIT;
