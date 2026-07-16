-- =============================================================================
-- 140_imagesource_workprovider.sql -- image-source/work-provider relation
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

COMMENT ON TABLE imagesource_workprovider IS 'Many-to-many image-source/work-provider relation.';

COMMIT;
