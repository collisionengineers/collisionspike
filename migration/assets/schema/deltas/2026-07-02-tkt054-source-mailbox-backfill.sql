-- =============================================================================
-- 2026-07-02-tkt054-source-mailbox-backfill.sql
-- TKT-054 / 020726 E7 -- one-off DATA backfill: source_mailbox GUID -> UPN
-- -----------------------------------------------------------------------------
-- WHY. Graph change notifications canonicalise `resource` to
-- Users/<object-id-GUID>/Messages/<id>; the orchestration stored that GUID
-- verbatim as inbound_email.source_mailbox / case_.source_mailbox, so every SPA
-- mailbox chip read "Other source". The CODE fix (orch commit da0571b, deployed
-- 2026-07-02) resolves the UPN for NEW mail; intake values are computed once, so
-- HISTORICAL rows need this backfill (project memory: intake not retroactive).
--
-- GUID -> UPN map resolved 2026-07-02 with the operator's own Graph access
-- (az rest GET /v1.0/users/<guid> ?$select=userPrincipalName,mail; upn == mail
-- for all three). The strings match GRAPH_INTAKE_MAILBOXES verbatim (the SPA
-- chip label/filter matching is exact).
--
-- IDEMPOTENT: a re-run matches zero rows. Run with app.role=staff (the RLS
-- UPDATE policy permits staff) or as the table owner.
-- VERIFY (expect 0 both):
--   SELECT count(*) FROM inbound_email WHERE source_mailbox NOT LIKE '%@%' AND source_mailbox <> '';
--   SELECT count(*) FROM case_          WHERE source_mailbox NOT LIKE '%@%' AND source_mailbox <> '';
-- =============================================================================
BEGIN;

UPDATE inbound_email SET source_mailbox = m.upn, updated_at = now()
  FROM (VALUES
    ('016aa11f-c276-4f54-a1be-a18ae0291bf9', 'engineers@collisionengineers.co.uk'),
    ('f07309ff-cdf9-4bdc-9b53-6c0345d64e90', 'info@collisionengineers.co.uk'),
    ('7189a6a3-6a19-4156-9659-eeaaf54e1fe6', 'desk@collisionengineers.co.uk')
  ) AS m(guid, upn)
 WHERE inbound_email.source_mailbox = m.guid;

UPDATE case_ SET source_mailbox = m.upn, updated_at = now()
  FROM (VALUES
    ('016aa11f-c276-4f54-a1be-a18ae0291bf9', 'engineers@collisionengineers.co.uk'),
    ('f07309ff-cdf9-4bdc-9b53-6c0345d64e90', 'info@collisionengineers.co.uk'),
    ('7189a6a3-6a19-4156-9659-eeaaf54e1fe6', 'desk@collisionengineers.co.uk')
  ) AS m(guid, upn)
 WHERE case_.source_mailbox = m.guid;

COMMIT;
