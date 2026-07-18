-- Capture hardening live delta (TKT-200 offline-review follow-ups). Fresh builds
-- receive the same objects from 197_capture_rate_limit.sql, 196_capture_session.sql
-- and 900_constraints.sql. This file is replay-safe for the existing live database.
BEGIN;

CREATE TABLE IF NOT EXISTS capture_rate_limit (
  scope_key          varchar(200) PRIMARY KEY,
  window_started_at  timestamptz NOT NULL,
  request_count      integer NOT NULL CHECK (request_count >= 1),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE capture_rate_limit ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_rate_limit FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_capture_rate_limit_rw ON capture_rate_limit;
-- Staff deletes are the stale-window purge (cleanup timer): no restrictive
-- no-delete policy, mirroring capture_session_resume_token.
CREATE POLICY p_capture_rate_limit_rw ON capture_rate_limit
  USING (current_setting('app.role', true) IN ('staff','admin'))
  WITH CHECK (current_setting('app.role', true) IN ('staff','admin'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON capture_rate_limit TO cespk_app;
  END IF;
END $$;

-- uq_evidence_capture_asset no-ops on NULL source_message_id; guarantee capture
-- evidence always carries its asset-embedding identity. The capture surface is
-- dark, so no live rows can violate this at apply time.
ALTER TABLE evidence DROP CONSTRAINT IF EXISTS ck_evidence_capture_source_message;
ALTER TABLE evidence ADD CONSTRAINT ck_evidence_capture_source_message
  CHECK (source_label IS DISTINCT FROM 'public_guided_capture'
         OR (source_message_id IS NOT NULL AND source_message_id LIKE 'public-capture:%'));

COMMIT;
