-- =============================================================================
-- 000_enums_lookups.sql  --  CollisionSpike code tables (Postgres 16)
-- -----------------------------------------------------------------------------
-- Source of truth : packages/domain/src/data/code-tables/*.json (22 code tables).
-- Translation rule: every code-table definition becomes a `choice_*` lookup
--                   table. The stable option value (integer code) is copied
--                   VERBATIM into `code` -- these integers are a hard contract
--                   (EVA payload codes, packages/domain/src/contracts, the Vitest parity
--                   test, and the deterministic classifier all key on them). They
--                   MUST NOT be renumbered, ever (ADR-0019 / R4).
--
-- Why lookup tables (not native PG enums): the integer codes must stay explicit,
-- queryable, and joinable; a native enum hides the code and cannot carry the label.
-- A FK from each business column (`*_code int`) to `choice_*(code)` reproduces the
-- domain attribute -> shared code-table relationship exactly.
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
-- Display label (kept for UI parity and debuggability).

-- ---------------------------------------------------------------------------
-- action_reason  (action-reason.json)  -- Case.action_reason_code
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
-- audit_action  (audit-event.json bundle)  -- AuditEvent.action_code
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
  (100000016, 'box_synced',                 'Archive Synced'),
  (100000017, 'corpus_record_changed',      'Corpus Record Changed'),
  (100000018, 'inspection_override',        'Inspection Override'),
  (100000019, 'box_folder_created',         'Archive Folder Created'),
  (100000020, 'box_file_request_copied',    'Image Upload Link Created'),
  (100000021, 'box_upload_received',        'Archive Upload Received'),
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
  (100000034, 'ai_suggestion_rejected',     'AI Suggestion Rejected'),
  -- Rules-engine-v2 Phase 2 ref-gate + cancellation lifecycle (2026-07-02 delta -- see
  -- deltas/2026-07-02-rules-engine-v2-taxonomy.sql). Distinct from
  -- ai_suggestion_created/accepted/rejected above (which audit review of the
  -- classifier's category/subtype SUGGESTION): these four audit the ref-gate's
  -- case-LINK decision -- suggest a link, accept it (attach), or detach later.
  (100000035, 'inbound_link_suggested',     'Inbound Link Suggested'),
  (100000036, 'inbound_linked',             'Inbound Linked'),
  (100000037, 'inbound_detached',           'Inbound Detached'),
  (100000038, 'cancellation_proposed',      'Cancellation Proposed'),
  -- Outlook filing lifecycle (TKT-054 / 020726 E6, 2026-07-02 delta -- see
  -- deltas/2026-07-02-tkt054-outlook-move.sql; gated by OUTLOOK_MOVE_ENABLED):
  -- requested = staff clicked File-to; moved/failed = the mover's terminal outcome.
  (100000039, 'outlook_move_requested',     'Outlook Move Requested'),
  (100000040, 'outlook_moved',              'Outlook Moved'),
  (100000041, 'outlook_move_failed',        'Outlook Move Failed'),
  -- Provider API intake channel (TKT-055 / ADR-0020, 2026-07-03 delta -- see
  -- deltas/2026-07-03-provider-api-intake.sql). Key lifecycle (mint/revoke) +
  -- the submission outcome (a case was created, or the submission was rejected
  -- on validation) for the machine-to-machine intake channel.
  (100000042, 'api_key_created',            'API Key Created'),
  (100000043, 'api_key_revoked',            'API Key Revoked'),
  (100000044, 'provider_api_case_created',  'Provider API Case Created'),
  (100000045, 'provider_api_case_rejected', 'Provider API Case Rejected'),
  -- Retroactive case reconstruction (TKT-058 / ADR-0022, 2026-07-04 delta -- see
  -- deltas/2026-07-04-retro-case.sql). created = a case was reconstructed from the
  -- Box archive / Outlook search; linked = the trigger email matched an EXISTING
  -- case (any status, incl. terminal); failed = the ladder found no source (the
  -- attempt stays visible even though nothing was minted).
  (100000046, 'retro_case_created',          'Retro Case Created'),
  (100000047, 'retro_case_linked',           'Retro Case Linked'),
  (100000048, 'retro_reconstruction_failed', 'Retro Reconstruction Failed'),
  -- PLAN-001 — evidence added via the assistant attach (TKT-068); autonomous MCP-agent
  -- read/write (TKT-110/3b, reserved — written only once agent writes ship).
  (100000049, 'evidence_added',              'Evidence Added'),
  (100000050, 'agent_read',                  'Agent Read'),
  (100000051, 'agent_write',                 'Agent Write'),
  -- Staged image-analysis suggestion producer run (TKT-016, 2026-07-08 delta -- see
  -- deltas/2026-07-08-image-analysis-suggestion-types.sql). One row per RUN of
  -- POST /api/cases/{id}/image-analysis/generate (how many observation suggestions were
  -- minted + which stages degraded), distinct from the per-suggestion ai_suggestion_created.
  (100000052, 'image_analysis_generated',    'Image Analysis Generated'),
  -- Case done lifecycle (TKT-094/095 / ADR-0023, 2026-07-09 delta -- see
  -- deltas/2026-07-09-case-done.sql). Written by the mark-done transition
  -- (manual button or a detector) when the CE report is delivered back to the
  -- work provider; pairs with the eva_submitted (100000015) export action.
  (100000053, 'report_delivered',            'Report Delivered'),
  -- TKT-148: deterministic draft suggestion, distinct from chaser_sent.
  (100000054, 'chaser_suggested',            'Chase suggested'),
  -- TKT-166: one result per Manual Intake source-file attempt.
  (100000055, 'evidence_upload_result',       'Files Checked'),
  (100000056, 'capture_session_created',      'Capture Session Created'),
  (100000057, 'capture_session_rotated',      'Capture Session Rotated'),
  (100000058, 'capture_session_revoked',      'Capture Session Revoked'),
  (100000059, 'capture_asset_validated',      'Capture Asset Validated'),
  (100000060, 'capture_session_completed',    'Capture Session Completed'),
  (100000061, 'capture_session_retargeted',   'Capture Session Retargeted'),
  (100000062, 'capture_session_locked',       'Capture Session Locked'),
  -- TKT-160: explicit, staff-confirmed single-image deletion lifecycle
  -- (renumbered to 63-65 at rebase; #83/TKT-200 took 56-62).
  (100000063, 'image_deletion_requested',     'Image Deletion Requested'),
  (100000064, 'image_deletion_failed',        'Image Deletion Needs Retry'),
  (100000065, 'image_deleted',                'Image Deleted');

-- ---------------------------------------------------------------------------
-- audit_severity  (audit-event.json bundle)  -- AuditEvent.severity_code
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
-- case_link_state  (case-link-state.json)  -- Case.case_link_state_code
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
-- case_status  (case-status.json)  -- Case.status_code
--   The parity keystone. names == packages/domain/src/contracts/case-status.ts
--   CaseStatus union 1:1. Terminals: eva_submitted, box_synced, error, removed,
--   done (post-EVA delivery, TKT-094/ADR-0023). box_synced is RETAINED for
--   history but is NO LONGER the lifecycle tail (Box folders are minted at
--   intake); the linear tail is ... -> eva_submitted -> done.
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
  (100000009, 'box_synced',              'Archive Synced'),
  (100000010, 'error',                   'Error'),
  -- TERMINAL. Superuser soft-remove (work-todo-spike: ui-changes/delete-case): the case
  -- row + audit trail survive; PII is anonymised and the status is locked here so the
  -- status guard never re-promotes it and dedup/merge never targets it. Append-only.
  (100000011, 'removed',                 'Removed'),
  -- TERMINAL. Post-EVA delivery (TKT-094/095, ADR-0023): the CE report has been
  -- delivered back to the work provider. Follows eva_submitted; written only by the
  -- explicit mark-done transition (guarded WHERE status_code = eva_submitted), never
  -- computed by the status guard.
  (100000012, 'done',                    'Done');

-- ---------------------------------------------------------------------------
-- case_type  (case-type.json)  -- Case.case_type_code
-- ---------------------------------------------------------------------------
CREATE TABLE choice_case_type (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_case_type (code, name, label) VALUES
  (100000000, 'standard',         'Standard'),
  (100000001, 'audit',            'Audit'),
  (100000002, 'audit_total_loss', 'Audit (Total Loss)'),   -- ADR-0021: AP. marker (review-time refinement)
  (100000003, 'diminution',       'Diminution');           -- ADR-0021: D. marker

-- ---------------------------------------------------------------------------
-- chaser_target_type  (chaser.json bundle)  -- Chaser.target_type_code
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
-- chaser_channel  (chaser.json bundle)  -- Chaser.channel_code
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
-- chaser_status  (chaser.json bundle)  -- Chaser.status_code
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
-- evidence_kind  (evidence-kind.json)  -- Evidence.kind_code
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
-- field_provenance_source_type  (field-provenance-source-type.json)
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
  (100000010, 'manual_upload',  'Manual Upload'),
  (100000011, 'unknown',        'Source Not Recorded');

-- ---------------------------------------------------------------------------
-- image_role  (image-role.json)  -- Evidence.image_role_code
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
-- image_source_kind  (image-source.json bundle)  -- ImageSource.kind_code
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
-- image_source_channel  (image-source.json bundle)  -- ImageSource.channel_code
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
-- improvement_signal_classification  (improvement-signal-classification.json)
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
-- inbound_category  (inbound-email-classification.json bundle)
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
  (100000002, 'other',          'Other'),
  -- append-only (collisionspike TKT-029/037/038): billing (an invoice/fee request) and
  -- non_actionable (a case-summary digest or bare acknowledgement) join the originals.
  (100000003, 'billing',         'Billing'),
  (100000004, 'non_actionable',  'Non-actionable'),
  -- append-only (rules-engine-v2 Phase 2, 2026-07-02 delta -- see
  -- deltas/2026-07-02-rules-engine-v2-taxonomy.sql and
  -- docs/adr/0019-triage-policy-stage-split.md): case_update (a ref-matched case
  -- with new evidence, vs a bare query) and cancellation (cancellation phrases) join the
  -- set. Emitted only once the taxonomy-v2 engine tag ships (Phase-0's tag emits v1 only).
  (100000005, 'case_update',  'Case update'),
  (100000006, 'cancellation', 'Cancellation'),
  -- append-only (PLAN-003 classifier wave, 2026-07-09 delta -- see
  -- deltas/2026-07-09-taxonomy-v3-pre-instruction-payments.sql, TKT-084): directions
  -- sent BEFORE the official instruction; no case minted -- the row is held and
  -- correlated onto the later instruction's case (suggest-first, gated
  -- TRIAGE_PRE_INSTRUCTION_ENABLED).
  (100000007, 'pre_instruction', 'Pre-instruction'),
  -- append-only (TKT-170): contact forms from the CE website. This is a lead/enquiry,
  -- never existing-case work and never a case-minting category.
  (100000008, 'website_enquiry', 'Website enquiry');

-- ---------------------------------------------------------------------------
-- inbound_subtype  (inbound-email-classification.json bundle)
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
  (100000005, 'other',                         'Other'),
  (100000006, 'existing_provider_diminution',  'Existing Provider Diminution'),
  -- append-only (collisionspike TKT-029/037/038): subtypes for the billing /
  -- non_actionable categories above.
  (100000007, 'billing_request',               'Billing Request'),
  (100000008, 'case_summary',                  'Case Summary'),
  (100000009, 'acknowledgement',               'Acknowledgement'),
  -- append-only (rules-engine-v2 Phase 2, 2026-07-02 delta -- see
  -- deltas/2026-07-02-rules-engine-v2-taxonomy.sql): images_received is the ONLY
  -- subtype actually named in the plan text (Phase 2 "Images-received routing",
  -- TKT-034/043). cancellation_notice and update_general are NOT plan-named -- they are
  -- minimal completions so the case_update/cancellation categories above each have a
  -- subtype to land on; flagged for operator review when Phase 2's build supplies the
  -- real subtype set.
  (100000010, 'images_received',     'Images received'),
  (100000011, 'cancellation_notice', 'Cancellation notice'),
  (100000012, 'update_general',      'Case update — general'),
  -- append-only (PLAN-003 classifier wave, 2026-07-09 delta -- see
  -- deltas/2026-07-09-taxonomy-v3-pre-instruction-payments.sql): payment_remittance
  -- (TKT-105/120 -- an inbound remittance advice / transfer notice, the mirror-image of
  -- billing_request, filed under billing) and pre_instruction_directions (TKT-084 --
  -- pre_instruction's only subtype).
  (100000013, 'payment_remittance',         'Payment received'),
  (100000014, 'pre_instruction_directions', 'Pre-instruction directions'),
  (100000015, 'website_general_enquiry',    'Website general enquiry'),
  -- append-only (TKT-226 -- see migrations/2026-07-17-tkt226-retro-related-subtype.sql):
  -- retro_related is stamped by the retro link-related lane (TKT-222) for correspondence
  -- retroactively linked to a reconstructed case. System-stamped only -- the classifier
  -- never emits it (classifierEmits: false, diminution precedent).
  (100000016, 'retro_related',              'Related (retro-linked)');

-- ---------------------------------------------------------------------------
-- inspection_decision_mode  (inspection-decision-mode.json)
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
-- inspection_location_policy  (inspection-location-policy.json)
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
-- intake_channel_kind  (intake-channel.json)  -- Case.intake_channel_kind_code
-- ---------------------------------------------------------------------------
CREATE TABLE choice_intake_channel_kind (
  code  integer PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);
INSERT INTO choice_intake_channel_kind (code, name, label) VALUES
  (100000000, 'email',        'Email'),
  (100000001, 'whatsapp',     'WhatsApp'),
  -- Machine-to-machine provider API intake channel (TKT-055 / ADR-0020, 2026-07-03 delta).
  (100000002, 'provider_api', 'Provider API'),
  -- Case reconstructed after the fact from the Box archive / Outlook search
  -- (TKT-058 / ADR-0022, 2026-07-04 delta) -- the retro fallback's provenance.
  (100000003, 'retro',        'Retro (reconstructed)');

-- ---------------------------------------------------------------------------
-- provider_automation_mode  (provider-automation-mode.json)
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
-- review_state  (review-state.json)  -- FieldLevelProvenance.review_state_code
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
-- All integer codes copied verbatim from the domain code tables. Do not renumber.
