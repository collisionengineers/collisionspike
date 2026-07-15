-- =============================================================================
-- 070_field_level_provenance.sql  --  cr1bd_fieldlevelprovenance
-- One row per (Case, EVA-relevant field) capturing WHERE a value came from + its
-- review state. field_name uses the prototype EVA_FIELD_ORDER camelCase keys, which
-- the API adapter maps to the case_.eva_* columns. case_id FK (CASCADE) in 900.
-- =============================================================================
BEGIN;

CREATE TABLE field_level_provenance (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              varchar(200) NOT NULL,        -- primaryColumn (derived case+field label)
  case_id           uuid NOT NULL,                -- -> case_ (parent, cascade); FK in 900
  field_name        varchar(100) NOT NULL,        -- EVA_FIELD_ORDER key, e.g. 'mileage'
  value             text,                         -- value as sourced (Memo 4000)
  source_type_code  integer NOT NULL REFERENCES choice_field_provenance_source_type(code),
  source_label      varchar(400),
  source_reference  varchar(400),
  confidence        numeric(5,4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  review_state_code integer NOT NULL DEFAULT 100000001 REFERENCES choice_review_state(code), -- needs_review
  reviewed_by       varchar(200),
  reviewed_at       timestamptz,
  notes             text,                         -- Memo 2000
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE field_level_provenance IS 'cr1bd_fieldlevelprovenance -- per (case, field) source + review; multiple source/conflict rows allowed per field.';

CREATE INDEX ix_flp_case_field ON field_level_provenance (case_id, field_name);

COMMIT;
