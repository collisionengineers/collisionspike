-- =============================================================================
-- 130_repairer_workprovider.sql  --  cr1bd_repairer_workprovider  (N:N intersect, ADR-0001)
-- One repairer serves several providers; one provider uses several repairers.
-- The Dataverse N:N intersect entity becomes a composite-PK junction table. Its FKs
-- (ON DELETE CASCADE -- an intersect row is meaningless once either side is gone) are
-- declared in 900_constraints.sql with the rest of the relationship constraints.
-- =============================================================================
BEGIN;

CREATE TABLE repairer_workprovider (
  repairer_id      uuid NOT NULL,
  work_provider_id uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (repairer_id, work_provider_id)
);

COMMENT ON TABLE repairer_workprovider IS 'cr1bd_repairer_workprovider -- N:N intersect (ADR-0001).';

COMMIT;
