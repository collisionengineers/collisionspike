-- =============================================================================
-- 110_improvement_signal.sql -- staff-correction signals
-- Staff corrections feeding a Management triage queue. Both lookups are nullable and
-- use ON DELETE SET NULL (RemoveLink) in 900.
-- LIVE WRITER since the suggested-tags work: the Data API writes a row on every staff
-- reclassification (services/data-api/src/features/inbound/routes.ts writeImprovementSignal, PATCH
-- /api/inbound/{id}/classification) — the earlier "deferred, no M1 writers" note is stale.
-- =============================================================================
BEGIN;

CREATE TABLE improvement_signal (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  varchar(400) NOT NULL,   -- summary
  case_id               uuid,                    -- -> case_ (nullable, SET NULL); FK in 900
  work_provider_id      uuid,                    -- -> work_provider (nullable, SET NULL); FK in 900
  field_name            varchar(100),
  original_value        text,                    -- Memo 4000
  corrected_value       text,                    -- Memo 4000
  original_provenance   varchar(400),
  actor                 varchar(200),
  occurred_at           timestamptz,
  affects_eva_readiness boolean,
  classification_code   integer REFERENCES choice_improvement_signal_class(code),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE improvement_signal IS 'Staff-correction triage queue.';

COMMIT;
