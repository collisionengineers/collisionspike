-- =============================================================================
-- 2026-07-08-ai-usage-ledger.sql
-- AI capacity ledger -- table + RLS + policies + GRANT (idempotent live-apply delta)
-- -----------------------------------------------------------------------------
-- PURPOSE. Live-apply counterpart of the canonical ../185_ai_usage_ledger.sql
-- (TKT-113; activation remains in docs/operations/operator-actions.md). Adds the AI model-usage ledger:
-- a rolling per-(usage_day, actor, surface) tally of model calls + tokens across every
-- AI call site (the assistant, the classifier, email/location AI, the vision passes to
-- come). Best-effort capacity/monitoring INPUT written by an ATOMIC upsert -- NOT a hard
-- ceiling. The canonical file creates the table; its RLS + policies live in
-- ../900_constraints.sql (the ai_usage_ledger entry in the RLS FOREACH loop). This delta
-- carries BOTH so the live database reaches the same end state in a single apply.
--
-- DEPLOY ORDER. Apply BEFORE (or with) the api deploy that ships the ungated
-- recordAiUsage() writer (services/data-api/src/features/assistant/usage.ts, called from
-- features/assistant/chat-routes.ts on the /api/assistant/chat path). The writer is deliberately best-effort
-- and NEVER throws -- a missing table only produces a swallowed "[ai-usage] ledger write
-- failed" log line and an un-accruing ledger, not a broken chat turn. Applying this delta
-- closes that gap: the INSERT ... ON CONFLICT then succeeds and the ledger starts
-- accruing. Safe on its own: the table sits empty until the first model call writes to it.
--
-- IDEMPOTENT + ADDITIVE + TRANSACTIONAL. Every statement is safe to re-run (CREATE TABLE/
-- INDEX IF NOT EXISTS / guarded policy + grant creates); one BEGIN..COMMIT. A fresh rebuild
-- that already applied ../185_ai_usage_ledger.sql + ../900_constraints.sql no-ops here.
-- See ./README.md for the canonical-vs-delta relationship.
--
-- APPLY RUNBOOK: docs/operations/database.md connection pattern (transient firewall rule ->
-- Entra oss-rdbms token -> psql -> SET ROLE csadmin -> \i this file -> delete rule).
-- csadmin owns every table and bypasses RLS (this is schema DDL, not a staff/admin
-- app-role write). Do NOT use the csadmin KV pg-admin-password (stale-rotation footgun --
-- auth via the Entra azure_pg_admin path instead). Verify with the queries at the foot.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. ai_usage_ledger -- the rolling per-(day, actor, surface) tally (../185_ai_usage_ledger.sql).
--    The UNIQUE (usage_day, actor, surface) is the ON CONFLICT target the upsert needs.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_usage_ledger (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UTC day the usage falls on (the tally rolls at UTC midnight).
  usage_day      date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  -- Entra oid/upn of the caller, or a service/agent identity (e.g. 'classifier', 'email-ai').
  actor          text NOT NULL,
  -- Which AI surface spent the tokens: 'assistant' | 'classifier' | 'vision' | 'email_ai' | ...
  surface        text NOT NULL,
  -- The model deployment (e.g. 'gpt-5'); NULL when unknown.
  model          text,
  -- Running tallies for the (day, actor, surface). Bumped by the atomic upsert.
  calls          bigint NOT NULL DEFAULT 0,
  input_tokens   bigint NOT NULL DEFAULT 0,
  output_tokens  bigint NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- The upsert conflict target: one row per (day, actor, surface).
  CONSTRAINT uq_ai_usage_ledger_day_actor_surface UNIQUE (usage_day, actor, surface)
);

COMMENT ON TABLE ai_usage_ledger IS
  'AI model-usage ledger (TKT-113) -- rolling per-(day,actor,surface) tally of model calls + tokens; a best-effort capacity/monitoring input, NOT a hard ceiling. Written by an atomic upsert on (usage_day, actor, surface).';

-- Reporting reads: "today''s usage by surface", "this actor''s usage over time".
CREATE INDEX IF NOT EXISTS ix_ai_usage_ledger_day_surface ON ai_usage_ledger (usage_day, surface);

-- ---------------------------------------------------------------------------
-- 2. Row-Level Security -- the same staff/admin pattern as every other work table
--    (../900_constraints.sql RLS loop: ai_usage_ledger is in the FOREACH array):
--    read/insert/update for staff+admin, DELETE admin-only. Guarded so a re-run
--    does not error on the existing policies.
-- ---------------------------------------------------------------------------
ALTER TABLE ai_usage_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_ledger FORCE  ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_usage_ledger' AND policyname = 'p_ai_usage_ledger_rw') THEN
    CREATE POLICY p_ai_usage_ledger_rw ON ai_usage_ledger
      USING (current_setting('app.role', true) IN ('staff','admin'))
      WITH CHECK (current_setting('app.role', true) IN ('staff','admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_usage_ledger' AND policyname = 'p_ai_usage_ledger_no_delete') THEN
    CREATE POLICY p_ai_usage_ledger_no_delete ON ai_usage_ledger AS RESTRICTIVE FOR DELETE
      USING (current_setting('app.role', true) = 'admin');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Application-login privileges. cespk_app does NOT own the table (csadmin does), so it
--    needs an explicit grant to read/insert/update (never DELETE -- the ledger is not
--    purged by the app). Guarded on role existence so a fresh test DB without the app
--    login does not fail. Matches ../185_ai_usage_ledger.sql + provider_api_key.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE ON ai_usage_ledger TO cespk_app;
  END IF;
END $$;

COMMIT;

-- VERIFY (all read-only):
--   SELECT to_regclass('public.ai_usage_ledger');             -- expect: ai_usage_ledger (not NULL)
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'ai_usage_ledger'; -- expect t | t
--   SELECT policyname FROM pg_policies WHERE tablename = 'ai_usage_ledger' ORDER BY policyname;
--     -- expect p_ai_usage_ledger_no_delete, p_ai_usage_ledger_rw
--   SELECT conname FROM pg_constraint WHERE conname = 'uq_ai_usage_ledger_day_actor_surface'; -- expect 1 row
--   SELECT privilege_type FROM information_schema.role_table_grants
--     WHERE table_name = 'ai_usage_ledger' AND grantee = 'cespk_app' ORDER BY privilege_type; -- INSERT,SELECT,UPDATE
--   SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'; -- base-table count
