-- =============================================================================
-- 120_inbound_email.sql  --  cr1bd_inboundemail  (staged; Phase-8 triage, ADR-0015)
-- EXACTLY one row per email arriving at the shared inboxes -- the universal 'we saw
-- this' record. category/subtype names mirror email_classifier.py CATEGORY_*/SUBTYPE_*
-- 1:1. Both lookups are nullable + RemoveLink (SET NULL in 900). The dedup key
-- UNIQUE(source_message_id) is added in 900_constraints.sql.
-- triage_state + classifier_mode are deliberately short String tokens (not choicesets):
-- low-churn workflow/provenance flags, matching the Dataverse schema.
-- =============================================================================
BEGIN;

CREATE TABLE inbound_email (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              varchar(200) NOT NULL,       -- primaryColumn cr1bd_name (triage label)
  source_message_id varchar(400),                -- DEDUP KEY (alt key); UNIQUE in 900
  subject           varchar(400),
  from_address      varchar(320),                -- format:Email (RFC max)
  sender_domain     varchar(256),                -- provider-match key (domain only)
  source_mailbox    varchar(256),
  received_on       timestamptz,                 -- triage queue age/ordering key
  has_attachments   boolean,
  category_code     integer REFERENCES choice_inbound_category(code),  -- CHOSEN/current category (defaults to the classifier suggestion)
  subtype_code      integer REFERENCES choice_inbound_subtype(code),   -- CHOSEN/current subtype
  -- The ORIGINAL classifier suggestion, kept distinct from the chosen value so a staff
  -- override is captured (work-todo-spike: suggested-tags-and-folders). Written once at
  -- classify time (fill-if-null); category_code/subtype_code carry the human-chosen value.
  suggested_category_code integer REFERENCES choice_inbound_category(code),
  suggested_subtype_code  integer REFERENCES choice_inbound_subtype(code),
  confidence        double precision CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  classifier_mode   varchar(20),                 -- deterministic | llm | human
  signals           text,                        -- JSON/newline rule-id list (Memo 4000)
  triage_state      varchar(20),                 -- new | routed | actioned | dismissed
  body_vrm          varchar(16),
  body_caseref      varchar(32),
  body_preview      text,                        -- html-stripped preview (Memo 4000)
  case_id           uuid,                        -- -> case_ (nullable, SET NULL); FK in 900
  work_provider_id  uuid,                        -- -> work_provider (nullable, SET NULL); FK in 900
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE inbound_email IS 'cr1bd_inboundemail -- Phase-8 triage audit-of-record; one row per inbound email; classifier never auto-links.';

CREATE INDEX ix_inbound_email_received_on ON inbound_email (received_on);
CREATE INDEX ix_inbound_email_category    ON inbound_email (category_code);

COMMIT;
