-- =============================================================================
-- 050_case.sql  --  cr1bd_case  (M1-live; the central work item)
-- "case" is a reserved word in SQL, so the table is named case_ (and the API's
-- contract package maps domain camelCase keys <-> these snake_case columns).
-- Carries the 12 EVA payload fields (eva_*, evaOrder 1..12), the dedup keys, the
-- finalize submit-signal columns, the Box one-way-mirror columns, the two retention
-- clocks (ADR-0017, gated-off), and overview-only (ov_*) reference fields.
-- All Lookup columns (work_provider_id, image_source_id, inspection_address_id) get
-- their FKs + the UNIQUE(source_message_id) dedup key in 900_constraints.sql.
-- =============================================================================
BEGIN;

CREATE TABLE case_ (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- primaryColumn cr1bd_name (required) -- human label, NOT the Case/PO
  name                        varchar(100) NOT NULL,

  -- ---- Case identity / correlation (NOT EVA payload fields) ----------------
  vrm                         varchar(16),    -- primary correlation key (ADR-0002)
  case_ref                    varchar(100),   -- dedup tiebreaker (ADR-0010)
  case_po                     varchar(32),    -- principalCode+YY+NNN; set at parse-confirm
  on_hold                     boolean NOT NULL DEFAULT false,
  -- Machine-readable ownership of a hold. `provider_unresolved` is the only
  -- reason automated provider recovery may advance; it stays Held as
  -- `provider_archive_pending` until its Archive folder is durably linked.
  on_hold_reason              varchar(40),

  -- ---- Dedup keys ----------------------------------------------------------
  source_message_id           varchar(400),   -- DEDUP KEY (alt key); UNIQUE in 900
  payload_hash                varchar(80),    -- secondary/advisory near-dup token
  finalized_payload_hash      varchar(80),    -- finalize idempotency latch

  -- ---- Finalize submit-signal (Phase 7, ADR-0012) --------------------------
  submit_requested            boolean NOT NULL DEFAULT false,  -- the finalize trigger boundary
  submit_payload_hash         varchar(80),
  eva_payload12               varchar(4000),  -- staged 12-field EVA JSON (Memo 4000)
  case_link_state_code        integer REFERENCES choice_case_link_state(code),
  duplicate_keys              text,           -- JSON candidate list (Memo 4000)

  -- ---- Workflow ------------------------------------------------------------
  status_code                 integer NOT NULL REFERENCES choice_case_status(code),
  case_type_code              integer REFERENCES choice_case_type(code),               -- default standard (null=standard)
  intake_channel_kind_code    integer REFERENCES choice_intake_channel_kind(code),
  intake_channel_manual       boolean,        -- true=manual, false=auto
  source_mailbox              varchar(256),
  action_reason_code          integer REFERENCES choice_action_reason(code),           -- stored, not derived
  date_due                    date,           -- DateOnly
  inspection_date             date,           -- DateOnly
  submitted_at                timestamptz,    -- UserLocal
  inspection_decision_code    integer REFERENCES choice_inspection_decision_mode(code),

  -- ---- Lookups (FKs in 900) ------------------------------------------------
  work_provider_id            uuid,           -- -> work_provider  (SET NULL)
  image_source_id             uuid,           -- -> image_source   (SET NULL)
  inspection_address_id       uuid,           -- -> inspection_address (SET NULL)

  -- ---- Box one-way mirror (Phase 7, ADR-0012; written Dataverse->Box only) --
  box_folder_id               varchar(40),
  box_file_request_id         varchar(40),
  box_file_request_url        varchar(400),   -- format:Url
  box_synced_at               timestamptz,    -- box-blob-purge age key
  box_folder_url              varchar(400),   -- format:Url

  -- ---- Retention clocks (Phase 9, ADR-0017 G1; gated-off, no writers yet) ---
  closed_at                   timestamptz,                    -- clock 1 start
  retention_expires_at        timestamptz,                    -- clock 1 expiry
  legal_hold                  boolean NOT NULL DEFAULT false, -- clock 2 (overrides expiry)
  legal_hold_reason           varchar(400),
  held_by                     varchar(200),

  -- ---- Durable status-recompute request (TKT-146) -------------------------
  -- A Box classification stamp increments requested_generation in the SAME
  -- transaction as the evidence update. The orchestration sweep advances
  -- completed_generation only after status evaluation succeeds, so a crash or
  -- transient API failure leaves durable retry work on the case.
  status_recompute_requested_generation bigint NOT NULL DEFAULT 0,
  status_recompute_completed_generation bigint NOT NULL DEFAULT 0,
  status_recompute_requested_at          timestamptz,

  -- ---- Durable provider Archive continuation (TKT-150) -------------------
  -- Provider recovery allocates identity in the merge transaction, then this
  -- generation keeps the remote Archive-folder ensure pending until the Data
  -- API verifies both the durable folder link and the cleared recovery hold.
  provider_archive_requested_generation bigint NOT NULL DEFAULT 0,
  provider_archive_completed_generation bigint NOT NULL DEFAULT 0,
  provider_archive_requested_at          timestamptz,
  provider_archive_completed_at          timestamptz,
  provider_archive_attempt_count         integer NOT NULL DEFAULT 0,
  provider_archive_next_attempt_at       timestamptz NOT NULL DEFAULT now(),
  provider_archive_last_attempt_at       timestamptz,
  provider_archive_last_error            varchar(200),

  -- ---- The 12 EVA payload fields (evaOrder 1..12) --------------------------
  eva_work_provider           varchar(200),   -- 1
  eva_vehicle_model           varchar(200),   -- 2
  eva_claimant_name           varchar(200),   -- 3
  eva_claimant_telephone      varchar(60),    -- 4
  eva_claimant_email          varchar(320),   -- 5  format:Email
  eva_date_of_loss            varchar(10),    -- 6  DD/MM/YYYY or ''
  eva_date_of_instruction     varchar(10),    -- 7  DD/MM/YYYY or ''
  eva_accident_circumstances  varchar(4000),  -- 8  free text (Memo)
  eva_inspection_address      varchar(2000),  -- 9  6 lines padded, or 'Image Based Assessment'
  eva_vat_status              varchar(3),     -- 10 '' | 'Yes' | 'No'
  eva_mileage                 varchar(20),    -- 11
  eva_mileage_unit            varchar(6),     -- 12 '' | 'Miles' | 'Km'

  -- ---- Overview-only reference fields (MUST NOT drive workflow) -------------
  ov_insured_name             varchar(200),
  ov_claimant_name            varchar(200),
  ov_third_party_name         varchar(200),
  ov_claim_number             varchar(100),
  ov_policy_reference         varchar(100),
  ov_incident_date            varchar(10),
  ov_claim_type               varchar(100),
  ov_insurer_name             varchar(200),
  ov_repairer_name            varchar(200),

  -- cr1bd_evaclaimantaddress -- geolocation clue, NOT one of the 12 EVA fields
  eva_claimant_address        varchar(2000),

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  -- EVA enum/format invariants preserved from the contract (kept byte-faithful)
  CONSTRAINT ck_case_eva_date_of_loss        CHECK (eva_date_of_loss        IS NULL OR eva_date_of_loss        ~ '^\d{2}/\d{2}/\d{4}$' OR eva_date_of_loss        = ''),
  CONSTRAINT ck_case_eva_date_of_instruction CHECK (eva_date_of_instruction IS NULL OR eva_date_of_instruction ~ '^\d{2}/\d{2}/\d{4}$' OR eva_date_of_instruction = ''),
  CONSTRAINT ck_case_eva_vat_status          CHECK (eva_vat_status          IS NULL OR eva_vat_status   IN ('', 'Yes', 'No')),
  CONSTRAINT ck_case_eva_mileage_unit        CHECK (eva_mileage_unit        IS NULL OR eva_mileage_unit IN ('', 'Miles', 'Km')),
  CONSTRAINT ck_case_on_hold_reason           CHECK (
    on_hold_reason IS NULL
    OR (on_hold = true AND on_hold_reason IN (
      'provider_unresolved', 'provider_archive_pending', 'manual'
    ))
  ),
  CONSTRAINT ck_case_status_recompute_generation CHECK (
    status_recompute_completed_generation <= status_recompute_requested_generation
  ),
  CONSTRAINT ck_case_provider_archive_generation CHECK (
    provider_archive_completed_generation <= provider_archive_requested_generation
    AND provider_archive_attempt_count >= 0
  )
);

COMMENT ON TABLE  case_ IS 'cr1bd_case -- central work item. EVA payload = the 12 eva_* columns ONLY (evaOrder 1..12); vrm/case_ref/case_po are identity, never EVA fields.';
COMMENT ON COLUMN case_.submit_requested IS 'Finalize trigger boundary: the SPA/API PATCHes true (+ submit_payload_hash + eva_payload12); the finalize Durable orchestration resets it false LAST.';

-- Hot query paths (dashboard facets, dedup probe, provider rollups)
CREATE INDEX ix_case_status              ON case_ (status_code);
CREATE INDEX ix_case_vrm                 ON case_ (vrm);
CREATE INDEX ix_case_case_po             ON case_ (case_po);
CREATE INDEX ix_case_work_provider_id    ON case_ (work_provider_id);
CREATE INDEX ix_case_action_reason       ON case_ (action_reason_code);
CREATE INDEX ix_case_submit_requested    ON case_ (submit_requested) WHERE submit_requested = true;
CREATE INDEX ix_case_status_recompute_pending
  ON case_ (status_recompute_requested_at, id)
  WHERE status_recompute_completed_generation < status_recompute_requested_generation;
CREATE INDEX ix_case_provider_archive_pending
  ON case_ (provider_archive_next_attempt_at, provider_archive_requested_at, id)
  WHERE provider_archive_completed_generation < provider_archive_requested_generation;

COMMIT;
