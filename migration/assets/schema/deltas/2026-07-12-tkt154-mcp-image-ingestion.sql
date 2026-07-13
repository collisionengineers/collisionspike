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

CREATE TABLE IF NOT EXISTS mcp_image_ingest_rate_limit (
  principal_id       varchar(200) PRIMARY KEY,
  window_started_at  timestamptz NOT NULL,
  request_count      integer NOT NULL CHECK (request_count >= 1),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mcp_image_ingest_rate_limit ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_image_ingest_rate_limit FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_mcp_image_ingest_rate_limit_rw ON mcp_image_ingest_rate_limit;
CREATE POLICY p_mcp_image_ingest_rate_limit_rw ON mcp_image_ingest_rate_limit
  USING (current_setting('app.role', true) IN ('staff','admin'))
  WITH CHECK (current_setting('app.role', true) IN ('staff','admin'));
DROP POLICY IF EXISTS p_mcp_image_ingest_rate_limit_no_delete ON mcp_image_ingest_rate_limit;
CREATE POLICY p_mcp_image_ingest_rate_limit_no_delete ON mcp_image_ingest_rate_limit
  AS RESTRICTIVE FOR DELETE
  USING (current_setting('app.role', true) = 'admin');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE ON mcp_image_ingest_rate_limit TO cespk_app;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS mcp_http_session (
  session_id        uuid PRIMARY KEY,
  principal_id      varchar(200) NOT NULL,
  protocol_version  varchar(32) NOT NULL,
  phase             varchar(16) NOT NULL CHECK (phase IN ('initializing', 'ready')),
  initialized_at    timestamptz,
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_mcp_http_session_expiry ON mcp_http_session (expires_at);
ALTER TABLE mcp_http_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_http_session FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_mcp_http_session_rw ON mcp_http_session;
CREATE POLICY p_mcp_http_session_rw ON mcp_http_session
  USING (current_setting('app.role', true) IN ('staff','admin'))
  WITH CHECK (current_setting('app.role', true) IN ('staff','admin'));
DROP POLICY IF EXISTS p_mcp_http_session_no_delete ON mcp_http_session;
CREATE POLICY p_mcp_http_session_no_delete ON mcp_http_session
  AS RESTRICTIVE FOR DELETE
  USING (current_setting('app.role', true) = 'admin');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE ON mcp_http_session TO cespk_app;
  END IF;
END $$;

COMMIT;
