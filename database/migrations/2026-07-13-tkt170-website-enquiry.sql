-- TKT-170 — append-only Website enquiry category and subtype.
-- Apply before deploying a parser/orchestration/API build that may emit these codes.
BEGIN;

INSERT INTO choice_inbound_category (code, name, label) VALUES
  (100000008, 'website_enquiry', 'Website enquiry')
ON CONFLICT (code) DO NOTHING;

INSERT INTO choice_inbound_subtype (code, name, label) VALUES
  (100000015, 'website_general_enquiry', 'Website general enquiry')
ON CONFLICT (code) DO NOTHING;

COMMIT;
