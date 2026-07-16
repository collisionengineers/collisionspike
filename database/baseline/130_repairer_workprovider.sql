-- =============================================================================
-- 130_repairer_workprovider.sql -- repairer/work-provider relation (ADR-0001)
-- One repairer serves several providers; one provider uses several repairers.
-- The many-to-many relationship uses a composite-primary-key junction table. Its FKs
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

COMMENT ON TABLE repairer_workprovider IS 'Many-to-many repairer/work-provider relation (ADR-0001).';

COMMIT;
