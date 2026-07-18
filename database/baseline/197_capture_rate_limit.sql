-- 197_capture_rate_limit.sql -- durable public-capture admission control (TKT-200 follow-up)
-- -----------------------------------------------------------------------------
-- One row per throttle scope: `ip:{caller}` for every anonymous public capture
-- request plus `{route}:{sessionId}` after bearer verification. The API updates
-- this row atomically BEFORE any other public-capture work, so concurrent
-- Functions instances share one per-minute budget (same single-UPSERT pattern as
-- mcp_image_ingest_rate_limit). Stale windows are purged by the capture cleanup
-- timer, so the app role holds DELETE (mirrors capture_session_resume_token).
-- =============================================================================
BEGIN;

CREATE TABLE capture_rate_limit (
  scope_key          varchar(200) PRIMARY KEY,
  window_started_at  timestamptz NOT NULL,
  request_count      integer NOT NULL CHECK (request_count >= 1),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Canonical forced-RLS policies are applied by 900_constraints.sql (explicit
-- block without the restrictive no-delete policy: staff purges stale windows).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON capture_rate_limit TO cespk_app;
  END IF;
END $$;

COMMIT;
