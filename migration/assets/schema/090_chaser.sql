-- =============================================================================
-- 090_chaser.sql  --  cr1bd_chaser  (staged; draft-only in M1, ADR-0003)
-- A tracked request for missing items. case_id FK (ON DELETE CASCADE) in 900.
-- =============================================================================
BEGIN;

CREATE TABLE chaser (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              varchar(400) NOT NULL,       -- primaryColumn cr1bd_name (queue summary)
  case_id           uuid NOT NULL,               -- -> case_ (parent, cascade); FK in 900
  target_type_code  integer NOT NULL REFERENCES choice_chaser_target_type(code),
  target_name       varchar(200),
  channel_code      integer NOT NULL REFERENCES choice_chaser_channel(code),
  template_used     varchar(200),
  suggested         boolean NOT NULL DEFAULT false, -- system-created draft, not a sent/logged chase
  status_code       integer NOT NULL DEFAULT 100000000 REFERENCES choice_chaser_status(code), -- drafted
  sent_by           varchar(200),
  sent_at           timestamptz,
  drafted_at        timestamptz,                 -- cr1bd_createdon2 (domain timestamp)
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE chaser IS 'cr1bd_chaser -- missing-items request; draft-only in M1 (send is gated, ADR-0003).';

CREATE INDEX ix_chaser_case_id ON chaser (case_id);
CREATE UNIQUE INDEX uq_chaser_overview_suggestion
  ON chaser (case_id)
  WHERE template_used = 'Overview photo request'
    AND name = 'Suggested chase — ask for a photo of the whole vehicle showing the registration plate clearly.';

COMMIT;
