-- =============================================================================
-- 2026-07-08-image-analysis-suggestion-types.sql
-- Staged image-analysis producer -- audit action + suggestion_type docs (idempotent)
-- -----------------------------------------------------------------------------
-- PURPOSE. The live-apply counterpart for the staged image-analysis suggestion
-- producer (TKT-016; docs/tickets/now/TKT-016-ai-image-analysis/). The producer is
-- ADDITIVE and OBSERVATION-ONLY: every output is an `ai_suggestion` row (review_state
-- 'pending'), promoted into evidence/case fields ONLY on human accept (ADR-0013). It
-- introduces new `suggestion_type` values and one run-level audit action:
--   - choice_audit_action : +1 row  (image_analysis_generated; code 100000052 -- the
--                                     RUN-level audit for POST /api/cases/{id}/
--                                     image-analysis/generate, distinct from the
--                                     per-suggestion ai_suggestion_created 100000032)
--   - ai_suggestion       : NO schema change. suggestion_type is an OPEN vocabulary
--                           (no CHECK constraint -- see ../160_ai_suggestion.sql); the
--                           new kinds need no DDL. This delta only REFRESHES the column
--                           COMMENT so the seed vocabulary stays documented.
--
-- NEW suggestion_type seed values (documentation only -- the column accepts any text):
--   'vehicle_present'    per-image: does the photo show a vehicle
--   'same_vehicle'       set-level: are all photos the same vehicle
--   'registration'       per-image: EXISTING kind reused -- reg visibility tri-state +
--                        the fast-alpr read (has the fill-if-empty promote branch)
--   'background_text'    per-image: readable signs / phone numbers / signage
--   'location_hint'      set-level: landmark / road-name / signage location clues
--   'address_suggestion' set-level: ranked best inspection-address (never auto-applied)
--
-- DEPLOY ORDER. Apply BEFORE (or with) flipping IMAGE_ANALYSIS_ENABLED on cespk-api-dev.
-- Safe on its own: the audit row sits unused while the gate is absent/false, and the
-- producer's per-suggestion ai_suggestion_created (100000032) already exists, so the
-- run-level audit is the only thing that would FK-fail before this applies -- and
-- writeAudit swallows that FK failure (never blocks the caller), so even applying LATE
-- only costs a few missing run-audit rows, never a broken run.
--
-- IDEMPOTENT + ADDITIVE + TRANSACTIONAL. ON CONFLICT DO NOTHING; one BEGIN..COMMIT. A
-- fresh rebuild that already applied the companion canonical ../000_enums_lookups.sql
-- (which carries code 100000052) no-ops here. See ./README.md for the canonical-vs-delta
-- relationship.
--
-- APPLY RUNBOOK: docs/azure/postgres.md connection pattern (transient firewall rule ->
-- Entra oss-rdbms token -> psql -> SET ROLE csadmin -> \i this file -> delete rule).
-- csadmin owns every table and bypasses RLS (schema DDL, not a staff/admin app-role
-- write). Do NOT use the csadmin KV pg-admin-password (stale-rotation footgun -- auth via
-- the Entra azure_pg_admin path instead). Verify with the queries at the foot.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. choice_audit_action -- the run-level image-analysis action. Append-only:
--    continues from 100000051 'agent_write' (../000_enums_lookups.sql / api/src/lib/audit.ts).
-- ---------------------------------------------------------------------------
INSERT INTO choice_audit_action (code, name, label) VALUES
  (100000052, 'image_analysis_generated', 'Image Analysis Generated')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. ai_suggestion.suggestion_type -- refresh the documented seed vocabulary (idempotent;
--    the column is an OPEN vocabulary with no CHECK, so this is documentation only).
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN ai_suggestion.suggestion_type IS
  'OPEN vocabulary (no CHECK). Seed kinds: image_role | registration | inspection_address | triage_category | case_link | cancellation; TKT-016 image-analysis adds vehicle_present | same_vehicle | background_text | location_hint | address_suggestion (registration is reused). Producers may add more.';

COMMIT;

-- VERIFY (all read-only):
--   SELECT code, name FROM choice_audit_action WHERE code = 100000052;
--     -- expect: image_analysis_generated
--   SELECT col_description('ai_suggestion'::regclass, ordinal_position)
--     FROM information_schema.columns
--    WHERE table_name = 'ai_suggestion' AND column_name = 'suggestion_type';
--     -- expect: the refreshed vocabulary comment mentioning the TKT-016 kinds
