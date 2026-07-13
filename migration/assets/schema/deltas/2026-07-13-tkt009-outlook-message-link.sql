-- TKT-009 — authoritative exact-message Outlook target for inbound-email rows.
-- Additive and replay-safe. Historical rows remain NULL and retain their saved preview;
-- new/replayed intake fills these columns from Microsoft Graph's message response.
BEGIN;

ALTER TABLE inbound_email
  ADD COLUMN IF NOT EXISTS graph_message_id varchar(1024),
  ADD COLUMN IF NOT EXISTS outlook_web_link varchar(4096);

COMMENT ON COLUMN inbound_email.graph_message_id IS
  'Microsoft Graph message id requested with Prefer: IdType="ImmutableId"; scoped with source_mailbox.';
COMMENT ON COLUMN inbound_email.outlook_web_link IS
  'Authoritative Microsoft Graph message.webLink after HTTPS/Outlook-host validation; never client-derived.';

-- The RFC Internet-Message-Id can legitimately repeat across shared mailboxes. The
-- previous global constraint made an info@ arrival update the engineers@ row, which
-- could cross-wire source_mailbox + immutable Graph id + webLink. Stage the new
-- constraint FIRST while the old API is still live. The old global constraint is
-- dropped only by the separate cutover delta after the composite-upsert API deploy.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'inbound_email'::regclass
       AND conname = 'uq_inbound_email_source_mailbox_message_id'
  ) THEN
    ALTER TABLE inbound_email
      ADD CONSTRAINT uq_inbound_email_source_mailbox_message_id
      UNIQUE NULLS NOT DISTINCT (source_mailbox, source_message_id);
  END IF;
END $$;

COMMIT;
