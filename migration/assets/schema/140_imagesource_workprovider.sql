-- =============================================================================
-- 140_imagesource_workprovider.sql  --  cr1bd_imagesource_workprovider  (N:N intersect)
-- An image source can supply for several work providers. Composite-PK junction;
-- FKs (ON DELETE CASCADE) in 900_constraints.sql.
-- =============================================================================
BEGIN;

CREATE TABLE imagesource_workprovider (
  image_source_id  uuid NOT NULL,
  work_provider_id uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (image_source_id, work_provider_id)
);

COMMENT ON TABLE imagesource_workprovider IS 'cr1bd_imagesource_workprovider -- N:N intersect (data-model.md ImageSource m:n).';

COMMIT;
