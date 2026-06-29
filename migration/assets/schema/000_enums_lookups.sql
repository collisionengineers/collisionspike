-- =============================================================================
-- 000_enums_lookups.sql  --  CollisionSpike choiceset lookup tables (Postgres 16)
-- -----------------------------------------------------------------------------
-- Source of truth : dataverse/choicesets/*.json (17 files -> 22 global choice sets).
-- Translation rule: every Dataverse global choice set becomes a `choice_*` lookup
--                   table. The Dataverse OPTION VALUE (the integer code) is copied
--                   VERBATIM into `code` -- these integers are a hard contract
--                   (EVA payload codes, mockup-app/src/contracts, the Vitest parity
--                   test, and the deterministic classifier all key on them). They
--                   MUST NOT be renumbered, ever (ADR-0019 / R4).
--
-- Why lookup tables (not native PG enums): the integer codes must stay explicit,
-- queryable, and joinable; a native enum hides the code and cannot carry the label.
-- A FK from each business column (`*_code int`) to `choice_*(code)` reproduces the
-- Dataverse "Choice attribute -> global option set" relationship exactly.
--
-- Apply FIRST (before any NNN_<table>.sql), because the table files declare inline
-- FKs to these `choice_*` tables.
-- =============================================================================

BEGIN;

-- No CREATE EXTENSION here. gen_random_uuid() is in PostgreSQL core since v13 and the
-- server is pinned to PG16, so pgcrypto is NOT required.
-- IMPORTANT (Azure): do NOT add `CREATE EXTENSION ... pgcrypto` to this file. On Azure
-- Database for PostgreSQL Flexible Server every extension must first be allow-listed in
-- the `azure.extensions` server parameter (default allowlist is EMPTY); an un-allowlisted
-- CREATE EXTENSION raises `ERROR: extension "pgcrypto" is not allow-listed`. Because
-- 20-data §3 applies this DDL with `psql -v ON_ERROR_STOP=1` and this is the FIRST file,
-- such an error would abort the entire schema load on a fresh server.
-- Refs (Microsoft Learn): "Allow extensions" and "Considerations with the use of
-- extensions and modules" (pgcrypto), Azure Database for PostgreSQL flexible server.
-- If pgcrypto is ever genuinely needed, allow-list it OUT-OF-BAND first (NOT under the
-- same ON_ERROR_STOP run, and before the param is set):
--   az postgres flexible-server parameter set -g rg-collisionspike-dev \
--     -s cespk-pg-dev --name azure.extensions --value PGCRYPTO
-- confirm with `SHOW azure.extensions;`, then run `CREATE EXTENSION IF NOT EXISTS pgcrypto;`.

-- A tiny helper shape note: every choice_* table is (code PK, name UNIQUE, label).
-- `name` is the stable string token the contracts/classifier use; `label` is the
-- Dataverse display label (kept for UI parity / debuggability).

-- ---------------------------------------------------------------------------
-- cr1bd_actionreason  (action-reason.json)  -- Case.action_reason_code
-- ---------------------------------------------------------------------------
CREATE TABLE choice_action_reason (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_action_reason (code, name, label) VALUES
  (100000000, 'missing_images',       'Missing Images'),
  (100000001, 'missing_instructions', 'Missing Instructions'),
  (100000002, 'duplicate',            'Duplicate'),
  (100000003, 'conflict',             'Conflict'),
  (100000004, 'needs_review',         'Needs Review');

-- ---------------------------------------------------------------------------
-- cr1bd_auditaction  (audit-event.json bundle)  -- AuditEvent.action_code
--   Append-only vocabulary. NEVER renumber. Extend additively at the next free int.
-- ---------------------------------------------------------------------------
CREATE TABLE choice_audit_action (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_audit_action (code, name, label) VALUES
  (100000000, 'graph_message_ingested',     'Graph Message Ingested'),
  (100000001, 'graph_message_ingest_failed','Graph Message Ingest Failed'),
  (100000002, 'attachment_classified',      'Attachment Classified'),
  (100000003, 'case_created',               'Case Created'),
  (100000004, 'case_attached',              'Case Attached'),
  (100000005, 'duplicate_dropped',          'Duplicate Dropped'),
  (100000006, 'duplicate_flagged',          'Duplicate Flagged'),
  (100000007, 'provider_matched',           'Provider Matched'),
  (100000008, 'provider_unmatched',         'Provider Unmatched'),
  (100000009, 'parser_called',              'Parser Called'),
  (100000010, 'parser_failed',              'Parser Failed'),
  (100000011, 'enrichment_called',          'Enrichment Called'),
  (100000012, 'enrichment_failed',          'Enrichment Failed'),
  (100000013, 'status_changed',             'Status Changed'),
  (100000014, 'jobsheet_imported',          'Job Sheet Imported'),
  (100000015, 'eva_submitted',              'EVA Submitted'),
  (100000016, 'box_synced',                 'Box Synced'),
  (100000017, 'corpus_record_changed',      'Corpus Record Changed'),
  (100000018, 'inspection_override',        'Inspection Override'),
  (100000019, 'box_folder_created',         'Box Folder Created'),
  (100000020, 'box_file_request_copied',    'Box File Request Copied'),
  (100000021, 'box_upload_received',        'Box Upload Received'),
  (100000022, 'location_assist_confirmed',  'Location Assist Confirmed'),
  (100000023, 'chaser_sent',                'Chaser Sent'),
  (100000024, 'inbound_classified',         'Inbound Classified'),
  (100000025, 'inbound_routed',             'Inbound Routed'),
  (100000026, 'case_disposed',              'Case Disposed'),
  -- Phase-8 staff triage state-change actions (work-todo-spike: email-management).
  -- Written by the Data API when staff move an inbound_email between active/handled.
  (100000027, 'inbound_dismissed',          'Inbound Dismissed'),
  (100000028, 'inbound_actioned',           'Inbound Actioned'),
  (100000029, 'inbound_reopened',           'Inbound Reopened'),
  -- Superuser soft-remove of a case (work-todo-spike: ui-changes/delete-case).
  (100000030, 'case_removed',               'Case Removed'),
  -- Staff override of a classifier suggestion (work-todo-spike: suggested-tags-and-folders).
  (100000031, 'inbound_reclassified',       'Inbound Reclassified'),
  -- AI suggestion lifecycle (TKT-015 AI suggestion layer; gated by AI_ASSIST_ENABLED).
  -- created = a model produced a suggestion; accepted/rejected = a human reviewed it.
  (100000032, 'ai_suggestion_created',      'AI Suggestion Created'),
  (100000033, 'ai_suggestion_accepted',     'AI Suggestion Accepted'),
  (100000034, 'ai_suggestion_rejected',     'AI Suggestion Rejected');

-- ---------------------------------------------------------------------------
-- cr1bd_auditseverity  (audit-event.json bundle)  -- AuditEvent.severity_code
-- ---------------------------------------------------------------------------
CREATE TABLE choice_audit_severity (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_audit_severity (code, name, label) VALUES
  (100000000, 'info',    'Info'),
  (100000001, 'warning', 'Warning'),
  (100000002, 'error',   'Error');

-- ---------------------------------------------------------------------------
-- cr1bd_caselinkstate  (case-link-state.json)  -- Case.case_link_state_code
-- ---------------------------------------------------------------------------
CREATE TABLE choice_case_link_state (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_case_link_state (code, name, label) VALUES
  (100000000, 'none',    'None'),
  (100000001, 'pending', 'Pending'),
  (100000002, 'linked',  'Linked');

-- ---------------------------------------------------------------------------
-- cr1bd_casestatus  (case-status.json)  -- Case.status_code
--   The parity keystone. names == mockup-app/src/contracts/case-status.ts
--   CaseStatus union 1:1. Terminals: eva_submitted, box_synced, error.
-- ---------------------------------------------------------------------------
CREATE TABLE choice_case_status (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_case_status (code, name, label) VALUES
  (100000000, 'new_email',               'New Email'),
  (100000001, 'ingested',                'Ingested'),
  (100000002, 'needs_review',            'Needs Review'),
  (100000003, 'missing_required_fields', 'Missing Required Fields'),
  (100000004, 'missing_images',          'Missing Images'),
  (100000005, 'duplicate_risk',          'Duplicate Risk'),
  (100000006, 'linked_to_instruction',   'Linked to Instruction'),
  (100000007, 'ready_for_eva',           'Ready for EVA'),
  (100000008, 'eva_submitted',           'EVA Submitted'),
  (100000009, 'box_synced',              'Box Synced'),
  (100000010, 'error',                   'Error'),
  -- TERMINAL. Superuser soft-remove (work-todo-spike: ui-changes/delete-case): the case
  -- row + audit trail survive; PII is anonymised and the status is locked here so the
  -- status guard never re-promotes it and dedup/merge never targets it. Append-only.
  (100000011, 'removed',                 'Removed');

-- ---------------------------------------------------------------------------
-- cr1bd_casetype  (case-type.json)  -- Case.case_type_code
-- ---------------------------------------------------------------------------
CREATE TABLE choice_case_type (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_case_type (code, name, label) VALUES
  (100000000, 'standard', 'Standard'),
  (100000001, 'audit',    'Audit');

-- ---------------------------------------------------------------------------
-- cr1bd_chasertargettype  (chaser.json bundle)  -- Chaser.target_type_code
-- ---------------------------------------------------------------------------
CREATE TABLE choice_chaser_target_type (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_chaser_target_type (code, name, label) VALUES
  (100000000, 'image_source',  'Image Source'),
  (100000001, 'repairer',      'Repairer'),
  (100000002, 'work_provider', 'Work Provider');

-- ---------------------------------------------------------------------------
-- cr1bd_chaserchannel  (chaser.json bundle)  -- Chaser.channel_code
-- ---------------------------------------------------------------------------
CREATE TABLE choice_chaser_channel (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_chaser_channel (code, name, label) VALUES
  (100000000, 'email',    'Email'),
  (100000001, 'whatsapp', 'WhatsApp');

-- ---------------------------------------------------------------------------
-- cr1bd_chaserstatus  (chaser.json bundle)  -- Chaser.status_code
-- ---------------------------------------------------------------------------
CREATE TABLE choice_chaser_status (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_chaser_status (code, name, label) VALUES
  (100000000, 'drafted',   'Drafted'),
  (100000001, 'sent',      'Sent'),
  (100000002, 'responded', 'Responded'),
  (100000003, 'overdue',   'Overdue');

-- ---------------------------------------------------------------------------
-- cr1bd_evidencekind  (evidence-kind.json)  -- Evidence.kind_code
-- ---------------------------------------------------------------------------
CREATE TABLE choice_evidence_kind (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_evidence_kind (code, name, label) VALUES
  (100000000, 'image',           'Image'),
  (100000001, 'video',           'Video'),
  (100000002, 'instruction',     'Instruction'),
  (100000003, 'email',           'Email (.eml)'),
  (100000004, 'valuation',       'Valuation'),
  (100000005, 'eva_payload',     'EVA Payload'),
  (100000006, 'other',           'Other'),
  (100000007, 'engineer_report', 'Engineer Report (audited)');

-- ---------------------------------------------------------------------------
-- cr1bd_fieldprovenancesourcetype  (field-provenance-source-type.json)
--   FieldLevelProvenance.source_type_code
-- ---------------------------------------------------------------------------
CREATE TABLE choice_field_provenance_source_type (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_field_provenance_source_type (code, name, label) VALUES
  (100000000, 'staff',          'Staff'),
  (100000001, 'pdf_extraction', 'PDF Extraction'),
  (100000002, 'email_text',     'Email Text'),
  (100000003, 'corpus',         'Corpus'),
  (100000004, 'ai',             'AI'),
  (100000005, 'dvla_dvsa',      'DVLA / DVSA'),
  (100000006, 'document_ai',    'Document AI'),
  (100000007, 'azure_vision',   'Azure Vision'),
  (100000008, 'web_lookup',     'Web Lookup'),
  (100000009, 'whatsapp',       'WhatsApp'),
  (100000010, 'manual_upload',  'Manual Upload');

-- ---------------------------------------------------------------------------
-- cr1bd_imagerole  (image-role.json)  -- Evidence.image_role_code
-- ---------------------------------------------------------------------------
CREATE TABLE choice_image_role (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_image_role (code, name, label) VALUES
  (100000000, 'overview',       'Overview'),
  (100000001, 'damage_closeup', 'Damage Closeup'),
  (100000002, 'additional',     'Additional'),
  (100000003, 'unknown',        'Unknown');

-- ---------------------------------------------------------------------------
-- cr1bd_imagesourcekind  (image-source.json bundle)  -- ImageSource.kind_code
-- ---------------------------------------------------------------------------
CREATE TABLE choice_image_source_kind (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_image_source_kind (code, name, label) VALUES
  (100000000, 'provider_direct', 'Provider Direct'),
  (100000001, 'repairer',        'Repairer'),
  (100000002, 'intermediary',    'Intermediary'),
  (100000003, 'individual',      'Individual');

-- ---------------------------------------------------------------------------
-- cr1bd_imagesourcechannel  (image-source.json bundle)  -- ImageSource.channel_code
-- ---------------------------------------------------------------------------
CREATE TABLE choice_image_source_channel (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_image_source_channel (code, name, label) VALUES
  (100000000, 'email',    'Email'),
  (100000001, 'whatsapp', 'WhatsApp');

-- ---------------------------------------------------------------------------
-- cr1bd_improvementsignalclass  (improvement-signal-classification.json)
--   ImprovementSignal.classification_code
-- ---------------------------------------------------------------------------
CREATE TABLE choice_improvement_signal_class (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_improvement_signal_class (code, name, label) VALUES
  (100000000, 'parser_rule_candidate',     'Parser Rule Candidate'),
  (100000001, 'corpus_update_candidate',   'Corpus Update Candidate'),
  (100000002, 'provider_policy_candidate', 'Provider Policy Candidate'),
  (100000003, 'enrichment_issue',          'Enrichment Issue'),
  (100000004, 'one_off_case_issue',        'One-off Case Issue');

-- ---------------------------------------------------------------------------
-- cr1bd_inboundcategory  (inbound-email-classification.json bundle)
--   InboundEmail.category_code -- names == email_classifier.py CATEGORY_* 1:1
-- ---------------------------------------------------------------------------
CREATE TABLE choice_inbound_category (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_inbound_category (code, name, label) VALUES
  (100000000, 'receiving_work', 'Receiving Work'),
  (100000001, 'query',          'Query'),
  (100000002, 'other',          'Other');

-- ---------------------------------------------------------------------------
-- cr1bd_inboundsubtype  (inbound-email-classification.json bundle)
--   InboundEmail.subtype_code -- names == email_classifier.py SUBTYPE_* 1:1
-- ---------------------------------------------------------------------------
CREATE TABLE choice_inbound_subtype (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_inbound_subtype (code, name, label) VALUES
  (100000000, 'existing_provider_instruction', 'Existing Provider Instruction'),
  (100000001, 'existing_provider_audit',       'Existing Provider Audit'),
  (100000002, 'new_client_work',               'New Client Work'),
  (100000003, 'query_existing_work',           'Query: Existing Work'),
  (100000004, 'query_new_enquiry',             'Query: New Enquiry'),
  (100000005, 'other',                         'Other');

-- ---------------------------------------------------------------------------
-- cr1bd_inspectiondecisionmode  (inspection-decision-mode.json)
--   InspectionAddress.decision_mode_code + Case.inspection_decision_code
-- ---------------------------------------------------------------------------
CREATE TABLE choice_inspection_decision_mode (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_inspection_decision_mode (code, name, label) VALUES
  (100000000, 'confirmed_physical', 'Confirmed Physical'),
  (100000001, 'manual',             'Manual'),
  (100000002, 'image_based',        'Image Based'),
  (100000003, 'unknown',            'Unknown');

-- ---------------------------------------------------------------------------
-- cr1bd_inspectionlocationpolicy  (inspection-location-policy.json)
--   WorkProvider.inspection_location_policy_code
-- ---------------------------------------------------------------------------
CREATE TABLE choice_inspection_location_policy (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_inspection_location_policy (code, name, label) VALUES
  (100000000, 'always_image_based', 'Always Image Based'),
  (100000001, 'prefer_address',     'Prefer Address'),
  (100000002, 'required_address',   'Required Address');

-- ---------------------------------------------------------------------------
-- cr1bd_intakechannelkind  (intake-channel.json)  -- Case.intake_channel_kind_code
-- ---------------------------------------------------------------------------
CREATE TABLE choice_intake_channel_kind (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_intake_channel_kind (code, name, label) VALUES
  (100000000, 'email',    'Email'),
  (100000001, 'whatsapp', 'WhatsApp');

-- ---------------------------------------------------------------------------
-- cr1bd_providerautomationmode  (provider-automation-mode.json)
--   WorkProvider.provider_automation_mode_code
-- ---------------------------------------------------------------------------
CREATE TABLE choice_provider_automation_mode (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_provider_automation_mode (code, name, label) VALUES
  (100000000, 'manual',      'Manual'),
  (100000001, 'review_auto', 'Review Auto'),
  (100000002, 'full_auto',   'Full Auto (deferred)');

-- ---------------------------------------------------------------------------
-- cr1bd_reviewstate  (review-state.json)  -- FieldLevelProvenance.review_state_code
-- ---------------------------------------------------------------------------
CREATE TABLE choice_review_state (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_review_state (code, name, label) VALUES
  (100000000, 'not_required', 'Not Required'),
  (100000001, 'needs_review', 'Needs Review'),
  (100000002, 'reviewed',     'Reviewed'),
  (100000003, 'conflict',     'Conflict');

COMMIT;

-- 22 choice_* lookup tables created (13 single + 9 bundled across 17 source files).
-- All integer codes copied verbatim from dataverse/choicesets/*.json. Do not renumber.
