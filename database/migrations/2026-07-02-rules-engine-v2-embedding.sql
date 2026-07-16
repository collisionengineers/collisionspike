-- Additive embedding-prior storage for optional AI triage suggestions.
--
-- The column is nullable and currently has no runtime writer or reader. It remains plain
-- double precision[] because the current labelled corpus is small and app-side cosine does
-- not require a database extension. Any future population path must be authorized by its
-- owning ticket and use an approved labelled corpus; local PII test data is never a source.
--
-- This delta is idempotent, additive, and transactional. Apply it only through the current
-- database runbook in docs/operations/database.md. A future shape change must use a new
-- forward migration rather than editing or reversing this file.

BEGIN;

ALTER TABLE ai_suggestion ADD COLUMN IF NOT EXISTS embedding double precision[];

COMMENT ON COLUMN ai_suggestion.embedding IS
  'Optional nearest-neighbour re-rank signal for AI triage suggestions. Stored as double precision[] for app-side cosine at current corpus scale. No writer or reader is active; populate only from an explicitly approved labelled corpus.';

COMMIT;
