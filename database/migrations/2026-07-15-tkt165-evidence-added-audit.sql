-- TKT-165 -- seed the stable Add evidence audit action in existing databases.
BEGIN;

INSERT INTO choice_audit_action (code, name, label) VALUES
  (100000049, 'evidence_added', 'Evidence Added')
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM choice_audit_action
    WHERE code = 100000049
      AND name = 'evidence_added'
      AND label = 'Evidence Added'
  ) THEN
    RAISE EXCEPTION 'Audit action 100000049 is bound to an unexpected persisted mapping';
  END IF;
END $$;

COMMIT;
