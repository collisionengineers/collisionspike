-- =============================================================================
-- 2026-07-09-inbound-attention-reason.sql
-- PLAN-003 (TKT-119c / TKT-034) -- inbound_email.attention_reason (DDL ONLY)
-- -----------------------------------------------------------------------------
-- PURPOSE. A pipeline outcome that needs a PERSON gets a visible home on the
-- email's triage row instead of a silent nothing:
--   'unable_to_locate' -- the retro reconstruction ladder (ADR-0022) exhausted
--                        Outlook + Box history and found no case (written by the
--                        orchestration retroRecordFailure activity via
--                        POST /api/internal/inbound/attention);
--   'images_no_match'  -- an image-bearing email matched no case (the ADR-0015 §5
--                        fallback, TKT-034 -- written by the imagesUnmatched
--                        activity when decideTriage returns route_images_unmatched).
-- The SPA renders the reason as a plain-English chip ("Unable to locate" / "No
-- matching case") while the row is UNLINKED; linking the email to a case
-- supersedes it presentation-side (inbox-status.ts precedence).
--
-- ADDITIVE + IDEMPOTENT: ADD COLUMN IF NOT EXISTS; the CHECK travels with the
-- column so a re-run changes nothing. The API is schema-tolerant (hasColumn) --
-- deploy order between this delta and the api/orch deploys does not matter.
-- Canonical DDL updated in the same change: 120_inbound_email.sql.
-- Apply as the table owner (SET ROLE csadmin) -- inbound_email carries RLS.
-- =============================================================================

BEGIN;

ALTER TABLE inbound_email
  ADD COLUMN IF NOT EXISTS attention_reason varchar(32)
    CHECK (attention_reason IS NULL OR attention_reason IN ('unable_to_locate','images_no_match'));

COMMENT ON COLUMN inbound_email.attention_reason IS
  'TKT-119c/TKT-034 -- a pipeline outcome needing a person: unable_to_locate (retro reconstruction failed) | images_no_match (images with no case match). Rendered as a plain-English chip while the row is unlinked.';

COMMIT;

-- POST-CHECK:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='inbound_email' AND column_name='attention_reason';  -- 1 row
