-- TKT-009 historical Outlook-link remediation ledger. Replay-safe; no backfill is
-- executed by this DDL. Running the separate function-key protected reader is an
-- explicit later rollout step.
BEGIN;

CREATE TABLE IF NOT EXISTS outlook_link_backfill_ledger (
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

CREATE INDEX IF NOT EXISTS ix_outlook_link_backfill_inbound_attempted
  ON outlook_link_backfill_ledger (inbound_email_id, attempted_at DESC);

ALTER TABLE outlook_link_backfill_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlook_link_backfill_ledger FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT ON outlook_link_backfill_ledger TO cespk_app;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'outlook_link_backfill_ledger'
       AND policyname = 'p_outlook_link_backfill_ledger_select'
  ) THEN
    CREATE POLICY p_outlook_link_backfill_ledger_select
      ON outlook_link_backfill_ledger FOR SELECT
      USING (current_setting('app.role', true) IN ('staff','admin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'outlook_link_backfill_ledger'
       AND policyname = 'p_outlook_link_backfill_ledger_insert'
  ) THEN
    CREATE POLICY p_outlook_link_backfill_ledger_insert
      ON outlook_link_backfill_ledger FOR INSERT
      WITH CHECK (current_setting('app.role', true) IN ('staff','admin'));
  END IF;
END $$;

COMMIT;
