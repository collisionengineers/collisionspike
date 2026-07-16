-- =============================================================================
-- 030_image_source.sql -- image-source corpus table
-- The party/role that supplies a case's images/instructions. N:N to work_provider
-- (140_imagesource_workprovider.sql). repairer_id + default_inspection_address_id
-- FKs are added in 900_constraints.sql.
-- =============================================================================
BEGIN;

CREATE TABLE image_source (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                          varchar(200) NOT NULL,        -- required display name
  kind_code                     integer REFERENCES choice_image_source_kind(code),
  channel_code                  integer REFERENCES choice_image_source_channel(code),
  email_domain                  varchar(256),                 -- match key (channel=email)
  whatsapp_group                varchar(256),
  whatsapp_number               varchar(60),
  contact_name                  varchar(200),
  repairer_id                   uuid,   -- -> repairer (nullable); FK in 900
  default_inspection_address_id uuid,   -- -> inspection_address (nullable hint); FK in 900
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE image_source IS 'Image/instruction supplier role; many-to-many with work_provider; WhatsApp intake is manual (ADR-0007).';

COMMIT;
