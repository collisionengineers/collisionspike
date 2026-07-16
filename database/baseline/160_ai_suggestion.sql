-- =============================================================================
-- 160_ai_suggestion.sql  --  AI suggestion / observation layer  (TKT-015, gated)
-- -----------------------------------------------------------------------------
-- Current table and single home for AI
-- OUTPUT, recorded as a SUGGESTION first and promoted into evidence/case fields
-- ONLY on a deterministic rule or human accept (TKT-015 acceptance: "AI outputs
-- land as suggestions, never as silent mutations"). The sub-tool producers feed
-- it: image-analysis (TKT-016), reg-OCR (TKT-017), triage-category, inspection-
-- address; the deferred total-loss VLM (TKT-018) will use the same shape.
--
-- DELIBERATELY a separate layer (do NOT overload evidence/case_/inbound_email):
-- a raw model observation carries confidence, rationale, model_version + a review
-- lifecycle that the final reviewed columns (evidence.image_role_code /
-- registration_visible, case_ EVA fields) must NOT absorb. A suggestion is
-- promoted into those columns FILL-IF-EMPTY on human accept, in the Data API.
--
-- review_state is a short String token (pending|accepted|rejected|superseded),
-- NOT a choice_* lookup -- a low-churn workflow flag, matching inbound_email's
-- triage_state/classifier_mode style. suggestion_type is an OPEN vocabulary
-- (each producer adds its own kind); the seed values are documented, not CHECKed.
--
-- Relationship FKs (case_id/evidence_id CASCADE, inbound_email_id SET NULL),
-- the FK-side indexes, and Row-Level Security are added in 900_constraints.sql
-- (applied LAST), exactly like inbound_email (120).
--
-- embedding (rules-engine-v2 Phase 4, 2026-07-02 delta -- see
-- deltas/2026-07-02-rules-engine-v2-embedding.sql): the "embedding prior" nearest-
-- neighbours re-rank signal. Plain double precision[] at current corpus scale (app-side
-- cosine); pgvector is the documented, allowlisted-but-not-enabled scale path. DDL ONLY --
-- no writer/reader exists yet (see the delta's header for the full honest-scope note).
-- =============================================================================
BEGIN;

CREATE TABLE ai_suggestion (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Subject of the suggestion. All three are nullable: a suggestion may target a
  -- case (triage-category), a single evidence image (image_role / registration),
  -- and/or the inbound email it was derived from. case_id is the common anchor.
  case_id           uuid,                        -- -> case_           (nullable, CASCADE);  FK in 900
  evidence_id       uuid,                        -- -> evidence        (nullable, CASCADE);  FK in 900
  inbound_email_id  uuid,                        -- -> inbound_email   (nullable, SET NULL); FK in 900
  -- OPEN vocabulary (producers extend it). Seed kinds:
  --   'image_role' | 'registration' | 'inspection_address' | 'triage_category'
  suggestion_type   text NOT NULL,
  -- The proposed value, JSON so each suggestion_type carries its own shape (e.g.
  -- {"role":"overview"} | {"vrm":"AB12CDE","readable":true} | {"lines":[...]} |
  -- {"category":"case_update","subtype":"update_general"} for 'triage_category').
  suggested_value   jsonb NOT NULL,
  rationale         text,                        -- plain-language "why" (shown to the reviewer)
  confidence        numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  model_version     text,                        -- e.g. 'gpt-4o-2024-08-06' / 'fast-alpr@1.2' (NULL when none)
  -- Review lifecycle. pending -> accepted|rejected by a human; superseded when a
  -- newer suggestion for the same target replaces it. Append-on-write; the human
  -- decision is the only thing that promotes a value into evidence/case fields.
  review_state      text NOT NULL DEFAULT 'pending'
                      CHECK (review_state IN ('pending','accepted','rejected','superseded')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  reviewed_by       text,                        -- Entra oid/upn of the human who accepted/rejected
  reviewed_at       timestamptz,                 -- when the review decision was recorded
  -- rules-engine-v2 Phase 4 embedding prior (2026-07-02 delta) -- DDL only, see above.
  embedding         double precision[]
);

COMMENT ON TABLE ai_suggestion IS
  'AI suggestion/observation layer (TKT-015) -- model output recorded as a suggestion; promoted into evidence/case fields only on human accept. Gated by AI_ASSIST_ENABLED.';
COMMENT ON COLUMN ai_suggestion.embedding IS
  'Embedding prior for nearest-neighbours re-ranking. Plain float8[] at current corpus scale (app-side cosine); pgvector is the documented, allowlisted-but-not-enabled scale path. DDL-only -- no writer/reader exists yet; activation remains operator-owned in docs/operations/operator-actions.md.';

-- Pending-first listing for a case (GET /api/cases/{id}/ai-suggestions): the
-- common read is "this case's open suggestions, newest first".
CREATE INDEX ix_ai_suggestion_case_review ON ai_suggestion (case_id, review_state);
CREATE INDEX ix_ai_suggestion_created     ON ai_suggestion (created_at);

COMMIT;
