-- TKT-009 rolling cutover — RUN ONLY AFTER the API build whose inbound upsert uses
-- ON CONFLICT (source_mailbox, source_message_id) is live. The phase-A Outlook-link
-- delta must already have added uq_inbound_email_source_mailbox_message_id.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'inbound_email'::regclass
       AND conname = 'uq_inbound_email_source_mailbox_message_id'
  ) THEN
    RAISE EXCEPTION 'mailbox-qualified inbound constraint is missing; apply phase A first';
  END IF;
END $$;

ALTER TABLE inbound_email
  DROP CONSTRAINT IF EXISTS uq_inbound_email_source_message_id;

COMMIT;
