-- =============================================================================
-- 205_outlook_link_backfill.sql — append-only TKT-009 remediation ledger
-- Graph use is read-only. Each attempted historical match records its mailbox-qualified
-- source identity, outcome and (only when exact) immutable Graph/webLink tuple.
-- =============================================================================
BEGIN;

CREATE TABLE outlook_link_backfill_ledger (
  attempt_id        uuid PRIMARY KEY,
  inbound_email_id  uuid NOT NULL REFERENCES inbound_email(id) ON DELETE RESTRICT,
  source_mailbox    varchar(256) NOT NULL,
  source_message_id varchar(400) NOT NULL,
  outcome           varchar(40) NOT NULL CHECK (outcome IN (
    'resolved','not_found','not_accessible','ambiguous','unavailable',
    'stale_source','identity_conflict'
  )),
  reason             varchar(300) NOT NULL,
  graph_message_id   varchar(1024),
  outlook_web_link   varchar(4096),
  attempted_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (
    outcome <> 'resolved' OR
    (graph_message_id IS NOT NULL AND outlook_web_link IS NOT NULL)
  )
);

CREATE INDEX ix_outlook_link_backfill_inbound_attempted
  ON outlook_link_backfill_ledger (inbound_email_id, attempted_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT ON outlook_link_backfill_ledger TO cespk_app;
  END IF;
END $$;

COMMIT;
