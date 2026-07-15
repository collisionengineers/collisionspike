-- =============================================================================
-- 020_repairer.sql  --  cr1bd_repairer  (corpus table, ADR-0001 first-class entity)
-- Garage/bodyshop directory (job sheet 'Garages' tab). N:N to work_provider
-- (130_repairer_workprovider.sql). Referenced by inspection_address + image_source.
-- =============================================================================
BEGIN;

CREATE TABLE repairer (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             varchar(200) NOT NULL,            -- primaryColumn cr1bd_name (required)
  address_line1    varchar(200),
  address_line2    varchar(200),
  address_line3    varchar(200),
  address_line4    varchar(200),
  address_line5    varchar(200),
  address_line6    varchar(200),
  postcode         varchar(16),
  email            varchar(320),                     -- format:Email (validated app-side)
  phone            varchar(60),
  figures_expected boolean,
  active           boolean NOT NULL DEFAULT true,    -- active|archived; never hard-deleted
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- cr1bd_repairer_name_postcode_key (natural upsert/dedup key for the Garages reseed)
  CONSTRAINT uq_repairer_name_postcode UNIQUE (name, postcode)
);

COMMENT ON TABLE repairer IS 'cr1bd_repairer -- garage/bodyshop directory; N:N to work_provider; deactivate/merge, never hard-delete.';

COMMIT;
