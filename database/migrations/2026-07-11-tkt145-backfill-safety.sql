-- TKT-145 regression hardening: give system-authored case notes a durable,
-- per-source idempotency key. Existing human-authored notes remain unchanged.
BEGIN;

ALTER TABLE note
  ADD COLUMN IF NOT EXISTS source_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_note_case_source_key
  ON note (case_id, source_key)
  WHERE source_key IS NOT NULL;

COMMIT;
