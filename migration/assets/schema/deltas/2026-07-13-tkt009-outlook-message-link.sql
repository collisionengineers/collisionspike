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

COMMIT;
