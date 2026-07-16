-- =============================================================================
-- 040_inspection_address.sql -- inspection-address corpus and per-case table
-- Per-case inspection location for the EVA record OR a 'suggested' catalogue row
-- (ADR-0013/0016). image_based ALWAYS requires a non-empty decision_reason (never a
-- silent pass) -- enforced by the CHECK below + the M1 policy gate. repairer_id FK
-- in 900. ADR-0016 ranking metadata is set ONLY on 'suggested' rows (ordering only).
-- =============================================================================
BEGIN;

CREATE TABLE inspection_address (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label                varchar(200) NOT NULL,       -- required display label
  repairer_id          uuid,                        -- -> repairer (nullable); FK in 900
  decision_mode_code   integer NOT NULL DEFAULT 100000003   -- unknown
                         REFERENCES choice_inspection_decision_mode(code),
  decision_reason      text,                        -- REQUIRED when decision_mode=image_based
  source_label         varchar(100),                -- repairer|storage|home|'suggested[:status]'
  source_note          text,
  provider_code        varchar(16),                 -- ADR-0016 work-provider scoping (suggested rows; NULL on a Case)
  address_line1        varchar(200),
  address_line2        varchar(200),
  address_line3        varchar(200),
  address_line4        varchar(200),
  address_line5        varchar(200),
  address_line6        varchar(200),
  postcode             varchar(16),
  latitude             double precision,            -- corpus site centroid (offline geocode; ordering only)
  longitude            double precision,
  -- ADR-0016 offline ranking metadata (suggested rows only; NEVER carried on a Case)
  suggestion_frequency integer CHECK (suggestion_frequency IS NULL OR suggestion_frequency >= 0),
  last_seen_on         date,
  suggestion_rank      integer CHECK (suggestion_rank IS NULL OR suggestion_rank >= 1),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- atomic PATCH-to-key upsert for the suggestions reseed
  CONSTRAINT uq_inspection_address_label UNIQUE (label),
  -- image_based may never pass without an explicit reviewer reason (ADR-0013 invariant)
  CONSTRAINT ck_inspection_address_image_based_reason
    CHECK (decision_mode_code <> 100000002 OR (decision_reason IS NOT NULL AND length(btrim(decision_reason)) > 0))
);

COMMENT ON TABLE inspection_address IS 'Per-case location or suggested catalogue row; image_based requires a reason.';
COMMENT ON COLUMN inspection_address.source_label IS 'The suggested prefix marks low-confidence catalogue rows (decision_mode=unknown); read via source_label LIKE ''suggested%''.';

CREATE INDEX ix_inspection_address_suggested ON inspection_address (source_label)
  WHERE source_label LIKE 'suggested%';

-- Server-side provider scoping of the suggestions shortlist (TKT-076): the Data API filters
-- suggested rows by provider_code, so index it on the suggested partition.
CREATE INDEX ix_inspection_address_provider ON inspection_address (provider_code)
  WHERE source_label LIKE 'suggested%';

COMMIT;
