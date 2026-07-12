-- TKT-154 — constrained MCP image-ingestion audit binding.
-- Apply after 2026-07-12-tkt165-staff-evidence-upload.sql and before the API deploy.
BEGIN;

-- The values were reserved in the canonical schema by ADR-0023. Older live databases
-- predate that canonical edit, so make the write audit FK explicit here.
INSERT INTO choice_audit_action (code, name, label) VALUES
  (100000050, 'agent_read', 'Agent Read'),
  (100000051, 'agent_write', 'Agent Write')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE staff_evidence_upload
  ADD COLUMN IF NOT EXISTS registration varchar(16),
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

ALTER TABLE staff_evidence_upload
  DROP CONSTRAINT IF EXISTS ck_staff_evidence_upload_source;
ALTER TABLE staff_evidence_upload
  DROP CONSTRAINT IF EXISTS staff_evidence_upload_source_check;
ALTER TABLE staff_evidence_upload
  ADD CONSTRAINT ck_staff_evidence_upload_source CHECK (
    source IN ('add_evidence', 'manual_intake', 'assistant_confirmed', 'legacy_upload', 'mcp_agent')
  );

ALTER TABLE staff_evidence_upload
  DROP CONSTRAINT IF EXISTS ck_staff_evidence_upload_attempt_count;
ALTER TABLE staff_evidence_upload
  ADD CONSTRAINT ck_staff_evidence_upload_attempt_count CHECK (attempt_count >= 0);

DROP INDEX IF EXISTS uq_evidence_staff_upload_item;
CREATE UNIQUE INDEX uq_evidence_staff_upload_item
  ON evidence (source_message_id)
  WHERE source_label IN (
    'staff_add_evidence',
    'staff_manual_intake',
    'staff_assistant_confirmed',
    'staff_legacy_upload',
    'agent_image_ingest'
  );

COMMIT;
