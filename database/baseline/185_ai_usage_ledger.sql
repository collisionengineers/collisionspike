-- =============================================================================
-- 185_ai_usage_ledger.sql  --  AI model-usage ledger  (TKT-113, PLAN-001 Phase 4)
-- -----------------------------------------------------------------------------
-- Capacity and monitoring input: a
-- rolling per-(day, actor, surface) tally of model calls + tokens across every AI
-- call site (the assistant, the image classifier, email-AI, location-AI, and the
-- vision passes to come). It is DELIBERATELY not a hard ceiling: the ledger is
-- written best-effort via an ATOMIC upsert, so a concurrent one-call overshoot is
-- accepted rather than serialising every model call behind a lock.
--
-- `surface` separates assistant / classifier / vision usage (TKT-113 acceptance:
-- "capacity reporting can separate assistant, classifier, and vision usage").
-- `actor` is the Entra oid/upn of the caller, or a service/agent identity for a
-- non-interactive call site. RLS/grants follow the ai_suggestion pattern: enabled
-- in 900_constraints.sql (staff insert/update/select; delete admin-only).
-- =============================================================================
BEGIN;

CREATE TABLE ai_usage_ledger (
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
CREATE INDEX ix_ai_usage_ledger_day_surface ON ai_usage_ledger (usage_day, surface);

-- Application-login privileges. cespk_app does NOT own the table (csadmin does), so grant
-- it the same read/insert/update it has on the other work tables (guarded — the role only
-- exists on the live Flexible Server, not on a bare local restore). Matches provider_api_key.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE ON ai_usage_ledger TO cespk_app;
  END IF;
END $$;

COMMIT;
