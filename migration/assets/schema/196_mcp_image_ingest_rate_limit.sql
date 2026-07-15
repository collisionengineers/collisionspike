-- 196_mcp_image_ingest_rate_limit.sql -- durable admission control for TKT-154
-- -----------------------------------------------------------------------------
-- One row per app-only client. The API updates this row atomically before it
-- parses an image-ingestion request body, preventing concurrent Functions
-- instances from bypassing a process-local request counter.
-- =============================================================================
BEGIN;

CREATE TABLE mcp_image_ingest_rate_limit (
  principal_id       varchar(200) PRIMARY KEY,
  window_started_at  timestamptz NOT NULL,
  request_count      integer NOT NULL CHECK (request_count >= 1),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Canonical forced-RLS policies are applied by 900_constraints.sql after all
-- numbered table files have been created. The live delta carries the equivalent
-- explicit policies because it is applied to an already-built database.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE ON mcp_image_ingest_rate_limit TO cespk_app;
  END IF;
END $$;

COMMIT;
