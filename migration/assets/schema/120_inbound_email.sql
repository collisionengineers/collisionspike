-- =============================================================================
-- 120_inbound_email.sql  --  cr1bd_inboundemail  (staged; Phase-8 triage, ADR-0015)
-- EXACTLY one row per email arriving at the shared inboxes -- the universal 'we saw
-- this' record. category/subtype names mirror email_classifier.py CATEGORY_*/SUBTYPE_*
-- 1:1. Both lookups are nullable + RemoveLink (SET NULL in 900). The arrival dedup
-- key UNIQUE NULLS NOT DISTINCT(source_mailbox, source_message_id) is added in 900.
-- triage_state + classifier_mode are deliberately short String tokens (not choicesets):
-- low-churn workflow/provenance flags, matching the Dataverse schema.
--
-- body_jobref + conversation_id (rules-engine-v2 Phase 2, 2026-07-02 delta -- see
-- deltas/2026-07-02-rules-engine-v2-taxonomy.sql): captured by orchestration since the
-- Phase-0 deploy but persisted from this delta on. body_jobref feeds the Phase-2
-- pre-mint ref-gate; conversation_id is the Graph conversationId used for LOCAL thread
-- correlation only. The two idx_inbound_email_* indexes intentionally keep the "idx_"
-- prefix (not this file's usual "ix_") so their names match byte-for-byte what the delta
-- created on the already-live database -- see the delta file for why.
-- =============================================================================
BEGIN;

CREATE TABLE inbound_email (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              varchar(200) NOT NULL,       -- primaryColumn cr1bd_name (triage label)
  source_message_id varchar(400),                -- mailbox-qualified dedup key; UNIQUE in 900
  -- Graph identity/open target captured at intake (TKT-009). graph_message_id is
  -- requested with Prefer: IdType="ImmutableId" so ordinary same-mailbox moves do
  -- not invalidate it. outlook_web_link is Graph's own message.webLink; clients
  -- never assemble an Outlook URL from subject/body/Internet-Message-Id text.
  graph_message_id  varchar(1024),
  outlook_web_link  varchar(4096),
  -- Graph conversationId (rules-engine-v2 Phase 2): LOCAL thread correlation only, NOT
  -- a dedup key -- many messages share one conversation_id (source_message_id above is
  -- the actual dedup key).
  conversation_id   varchar(512),
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
  -- Engine-extracted existing-job reference (email_classifier.py _job_reference),
  -- distinct from body_caseref; feeds the Phase-2 pre-mint ref-gate (rules-engine-v2
  -- Phase 2 -- closes the TKT-023 leak: a job-ref-only reply currently mints a new case).
  body_jobref       varchar(64),
  body_preview      text,                        -- html-stripped preview (Memo 4000)
  case_id           uuid,                        -- -> case_ (nullable, SET NULL); FK in 900
  work_provider_id  uuid,                        -- -> work_provider (nullable, SET NULL); FK in 900
  -- Outlook filing lifecycle (TKT-054 / 020726 E6, 2026-07-02 delta -- see
  -- deltas/2026-07-02-tkt054-outlook-move.sql). NULL = never attempted;
  -- queued -> moved|failed via the gated orchestration mover (OUTLOOK_MOVE_ENABLED).
  outlook_move_state   varchar(20) CHECK (outlook_move_state IS NULL OR outlook_move_state IN ('queued','moved','failed')),
  outlook_moved_folder varchar(128),             -- destination path, e.g. Inbox/Instructions
  outlook_moved_at     timestamptz,              -- when the terminal moved/failed outcome landed
  -- TKT-119c/TKT-034 (2026-07-09 delta -- deltas/2026-07-09-inbound-attention-reason.sql):
  -- a pipeline outcome needing a person, rendered as a plain-English chip while unlinked.
  attention_reason  varchar(32) CHECK (attention_reason IS NULL OR attention_reason IN ('unable_to_locate','images_no_match')),
  -- Last terminal case-link evidence-backfill report. The reporting route locks the
  -- inbound row and audits only outcome transitions, so an at-least-once queue replay
  -- cannot duplicate the same audit event.
  evidence_backfill_report_outcome varchar(20) CHECK (
    evidence_backfill_report_outcome IS NULL OR
    evidence_backfill_report_outcome IN ('completed','partial','failed')
  ),
  evidence_backfill_reported_at timestamptz,
  evidence_backfill_requested_generation integer NOT NULL DEFAULT 0 CHECK (
    evidence_backfill_requested_generation >= 0
  ),
  evidence_backfill_enqueued_generation integer NOT NULL DEFAULT 0 CHECK (
    evidence_backfill_enqueued_generation >= 0 AND
    evidence_backfill_enqueued_generation <= evidence_backfill_requested_generation
  ),
  -- Persistence completion is stamped in the SAME transaction as recovered evidence.
  -- Reporting is separately monotonic/CAS-protected so a lost report can never let a
  -- later mailbox failure downgrade already-committed recovery work.
  evidence_backfill_completed_generation integer NOT NULL DEFAULT 0 CHECK (
    evidence_backfill_completed_generation >= 0 AND
    evidence_backfill_completed_generation <= evidence_backfill_requested_generation
  ),
  -- Exact terminal result committed with the evidence for completed_generation.
  -- A queue redelivery replays this snapshot instead of guessing "completed".
  evidence_backfill_completed_result jsonb CHECK (
    (evidence_backfill_completed_generation = 0 AND evidence_backfill_completed_result IS NULL) OR (
      evidence_backfill_completed_generation > 0 AND
      evidence_backfill_completed_result IS NOT NULL AND
      jsonb_typeof(evidence_backfill_completed_result) = 'object' AND
      evidence_backfill_completed_result->>'outcome' IN ('completed','partial')
    )
  ),
  evidence_backfill_reported_generation integer NOT NULL DEFAULT 0 CHECK (
    evidence_backfill_reported_generation >= 0 AND
    evidence_backfill_reported_generation <= evidence_backfill_requested_generation
  ),
  evidence_backfill_requested_at timestamptz,
  evidence_backfill_enqueued_at timestamptz,
  evidence_backfill_completed_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE inbound_email IS 'cr1bd_inboundemail -- Phase-8 triage audit-of-record; one row per inbound email; classifier never auto-links.';

CREATE INDEX ix_inbound_email_received_on ON inbound_email (received_on);
CREATE INDEX ix_inbound_email_category    ON inbound_email (category_code);
-- rules-engine-v2 Phase 2 (2026-07-02 delta): both columns are sparse (historical rows
-- predate capture; not every message carries a job ref), so index only populated rows.
CREATE INDEX IF NOT EXISTS idx_inbound_email_conversation ON inbound_email (conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbound_email_body_jobref   ON inbound_email (body_jobref)     WHERE body_jobref IS NOT NULL;

COMMIT;
