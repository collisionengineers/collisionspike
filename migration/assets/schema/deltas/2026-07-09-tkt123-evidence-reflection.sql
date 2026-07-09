-- =============================================================================
-- 2026-07-09-tkt123-evidence-reflection.sql
-- TKT-123 -- evidence person-reflection advisory flag + reviewer dismissal (idempotent)
-- -----------------------------------------------------------------------------
-- PURPOSE. The vision image classifier (TKT-064, orchestration image-classify.ts)
-- detects a person's/photographer's reflection in a photo (the domain rule: any
-- photo showing a person's reflection is unusable) but had no evidence column to
-- record it -- the observation only ever surfaced indirectly via the auto-exclusion.
-- This delta adds the ADVISORY flag + its reviewer dismissal so the SPA can badge
-- flagged images with a plain-English warning that staff can dismiss durably:
--   - evidence : +2 columns (person_reflection, reflection_dismissed --
--                 both boolean NOT NULL DEFAULT false)
--
-- The flag is ADDITIVE: the classifier's existing exclusion behaviour is unchanged;
-- exclusion stays a (separate) staff/classifier decision, the flag is observation.
-- No backfill: pre-delta rows read false (the classifier only started stamping the
-- flag with the 2026-07-09 orch deploy; the one-shot backfill can restamp later).
--
-- DEPLOY ORDER. Apply BEFORE the api/orch deploy that ships the TKT-123 code:
--   - api PATCH /api/evidence/{id} UPDATEs reflection_dismissed (fails w/o column);
--   - the internal evidence persist route now INSERTs person_reflection.
-- Safe on its own: the columns sit unused (default false) until the code ships.
--
-- IDEMPOTENT + ADDITIVE + TRANSACTIONAL. Every statement is safe to re-run
-- (IF NOT EXISTS); one BEGIN..COMMIT. A fresh rebuild that already applied the
-- companion canonical edit (../060_evidence.sql) no-ops here. See ./README.md.
--
-- APPLY RUNBOOK: docs/azure/postgres.md connection pattern (transient firewall rule ->
-- AAD token -> psql -> delete rule), run as csadmin; verify with the queries at the foot.
-- BACKUP-FIRST: snapshot the evidence table shape + rowcount before applying (below).
-- =============================================================================

-- Pre-flight snapshot (run + keep the output BEFORE the change):
--   SELECT count(*) AS evidence_rows FROM evidence;
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'evidence' ORDER BY ordinal_position;

BEGIN;

ALTER TABLE evidence ADD COLUMN IF NOT EXISTS person_reflection    boolean NOT NULL DEFAULT false;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS reflection_dismissed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN evidence.person_reflection    IS 'Vision classifier saw a person''s reflection in this photo (TKT-123; advisory -- exclusion is a separate decision).';
COMMENT ON COLUMN evidence.reflection_dismissed IS 'A reviewer dismissed the reflection warning (TKT-123; persists across reloads).';

COMMIT;

-- Verify:
--   SELECT column_name, data_type, column_default
--     FROM information_schema.columns
--    WHERE table_name = 'evidence' AND column_name IN ('person_reflection','reflection_dismissed');
--   -- expect two boolean rows, default false
