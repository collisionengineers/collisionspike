-- =============================================================================
-- 010_work_provider.sql  --  cr1bd_workprovider  (M1-live corpus table)
-- Governed corpus record (job sheet 'Principals' tab). Matched to mail BY EMAIL
-- DOMAIN. Seeds Case/PO via principal_code. Referenced rows are deactivated, never
-- hard-deleted (active flag) -- 900_constraints.sql uses SET NULL on its referrers.
-- Conventions: id uuid PK (<- cr1bd_workproviderid); created_at/updated_at mirror
-- the Dataverse createdon/modifiedon system columns the API surfaces.
-- =============================================================================
BEGIN;

CREATE TABLE work_provider (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- primaryColumn cr1bd_displayname (required)
  display_name                    varchar(200) NOT NULL,
  -- cr1bd_principalcode (alternateKey) -- lowercase=EVA code, UPPERCASE=Box/Case-PO prefix
  principal_code                  varchar(8),
  -- cr1bd_knownemaildomains (Memo) -- MATCHING KEY, newline/JSON list; domain match only
  known_email_domains             text,
  -- full sender-address overrides for generic domains (gmail/outlook) that can't be domain-keyed;
  -- newline/JSON list; address-level match, takes PRECEDENCE over domain match (seeded by 915)
  known_email_addresses           text,
  default_mailbox                 varchar(256),
  inspection_location_policy_code integer NOT NULL DEFAULT 100000001
                                    REFERENCES choice_inspection_location_policy(code), -- prefer_address
  provider_automation_mode_code   integer NOT NULL DEFAULT 100000001
                                    REFERENCES choice_provider_automation_mode(code),   -- review_auto
  instruction_notes               text,
  images_source_notes             text,
  report_return_notes             text,
  drag_into_eva                   boolean,
  ai_allowed                      boolean,           -- per-provider toggles: MODELED, deferred in M1
  eva_submit_allowed              boolean,
  enrichment_allowed              boolean,
  outbound_allowed                boolean,
  active                          boolean NOT NULL DEFAULT true,  -- active|archived
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  -- cr1bd_workprovider_principalcode_key (natural upsert key for the job-sheet reseed)
  CONSTRAINT uq_work_provider_principal_code UNIQUE (principal_code)
);

COMMENT ON TABLE  work_provider IS 'cr1bd_workprovider -- governed work-provider corpus; email-domain matched; principal_code seeds Case/PO.';
COMMENT ON COLUMN work_provider.known_email_domains IS 'cr1bd_knownemaildomains (Dataverse Memo, maxLength 2000). Match key; domain only, no alias matching.';
COMMENT ON COLUMN work_provider.known_email_addresses IS 'Full sender-address overrides for generic domains (e.g. gmail). Newline/JSON list; address-level match, takes precedence over domain match. Seeded by 915_corpus_email_address_match.sql.';

CREATE INDEX ix_work_provider_active ON work_provider (active);

COMMIT;
