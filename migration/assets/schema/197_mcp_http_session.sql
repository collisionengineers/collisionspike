-- 197_mcp_http_session.sql -- MCP initialize/initialized lifecycle state
-- -----------------------------------------------------------------------------
-- Streamable HTTP requests are stateless at the transport layer, but MCP still
-- requires initialize to be the first interaction. This table binds an opaque
-- server-minted session id to the authenticated principal and tracks the
-- initializing -> ready transition across scaled Function instances.
-- =============================================================================
BEGIN;

CREATE TABLE mcp_http_session (
  session_id        uuid PRIMARY KEY,
  principal_id      varchar(200) NOT NULL,
  protocol_version  varchar(32) NOT NULL,
  phase             varchar(16) NOT NULL CHECK (phase IN ('initializing', 'ready')),
  initialized_at    timestamptz,
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_mcp_http_session_expiry ON mcp_http_session (expires_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT, UPDATE ON mcp_http_session TO cespk_app;
  END IF;
END $$;

COMMIT;
