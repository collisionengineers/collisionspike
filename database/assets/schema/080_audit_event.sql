-- =============================================================================
-- 080_audit_event.sql  --  cr1bd_auditevent  (M1-live; APPEND-ONLY)
-- Domain-level workflow trail. case_id is NULLABLE (corpus-level events) and uses
-- ON DELETE SET NULL (Dataverse RemoveLink) in 900 so history survives a removed
-- case. Append-only is ENFORCED at the RLS layer in 900 (no UPDATE policy; DELETE
-- only for the admin role).
-- =============================================================================
BEGIN;

CREATE TABLE audit_event (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           varchar(400) NOT NULL,        -- primaryColumn cr1bd_name (one-line summary)
  case_id        uuid,                          -- -> case_ (nullable, RemoveLink); FK in 900
  actor          varchar(200),                  -- flow/orchestration name or staff display name
  action_code    integer NOT NULL REFERENCES choice_audit_action(code),
  severity_code  integer DEFAULT 100000000 REFERENCES choice_audit_severity(code),  -- info
  before         text,                          -- JSON snapshot (Memo 8000)
  after          text,                          -- JSON snapshot (Memo 8000)
  occurred_at    timestamptz NOT NULL,          -- event time (not row-create time)
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE audit_event IS 'cr1bd_auditevent -- append-only domain audit trail. RLS enforces no-update / admin-only-delete (see 900).';

CREATE INDEX ix_audit_event_case_id     ON audit_event (case_id);
CREATE INDEX ix_audit_event_occurred_at ON audit_event (occurred_at);

COMMIT;
