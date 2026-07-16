-- =============================================================================
-- 100_note.sql -- case notes
-- Free-text note on a case (a typed custom table, deliberately NOT the platform
-- annotation entity). case_id FK (ON DELETE CASCADE) in 900.
-- =============================================================================
BEGIN;

CREATE TABLE note (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        varchar(200),                  -- optional title
  case_id     uuid NOT NULL,                 -- -> case_ (parent, cascade); FK in 900
  author      varchar(200),
  text        text NOT NULL,                 -- required note text
  source_key  text,                          -- internal idempotency key for system-authored notes
  occurred_at timestamptz,                   -- domain timestamp (distinct from created_at)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE note IS 'Free-text case note; first-class typed table.';

CREATE INDEX ix_note_case_id ON note (case_id);

CREATE UNIQUE INDEX uq_note_case_source_key
  ON note (case_id, source_key)
  WHERE source_key IS NOT NULL;

COMMIT;
