-- =============================================================================
-- TKT-152 -- immutable vehicle lookup + MOT estimator evidence (idempotent delta)
-- Apply before a TKT-151 caller starts persisting vehicle-data.v1.
-- Fresh-build counterpart: ../200_vehicle_data.sql.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS mileage_model_profile (
  version varchar(100) NOT NULL,
  profile_kind varchar(20) NOT NULL CHECK (profile_kind IN ('cohort_prior','calibration')),
  dataset_digest char(64) NOT NULL CHECK (dataset_digest ~ '^[0-9a-f]{64}$'),
  profile jsonb NOT NULL CHECK (jsonb_typeof(profile) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_kind, version)
);

CREATE TABLE IF NOT EXISTS vehicle_lookup_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES case_(id) ON DELETE SET NULL,
  contract_version varchar(40) NOT NULL,
  algorithm_version varchar(60) NOT NULL,
  requested_registration varchar(40) NOT NULL,
  canonical_registration varchar(16) NOT NULL,
  target_date date NOT NULL,
  lookup_status varchar(32) NOT NULL CHECK (
    lookup_status IN ('found','not_found','invalid_registration','temporarily_unavailable','configuration_error')
  ),
  retrieved_at timestamptz NOT NULL,
  idempotency_key varchar(200),
  request_sha256 char(64) NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  response_sha256 char(64) NOT NULL CHECK (response_sha256 ~ '^[0-9a-f]{64}$'),
  response_envelope jsonb NOT NULL CHECK (jsonb_typeof(response_envelope) = 'object'),
  request_context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(request_context) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicle_provider_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_run_id uuid NOT NULL REFERENCES vehicle_lookup_run(id) ON DELETE RESTRICT,
  provider varchar(50) NOT NULL CHECK (provider IN ('dvsa_mot_history_v1','dvla_vehicle_enquiry_v1')),
  provider_status varchar(32) NOT NULL CHECK (
    provider_status IN ('found','not_found','invalid_registration','temporarily_unavailable','configuration_error')
  ),
  retrieved_at timestamptz NOT NULL,
  payload_sha256 char(64) CHECK (payload_sha256 IS NULL OR payload_sha256 ~ '^[0-9a-f]{64}$'),
  raw_payload jsonb,
  error_class varchar(120),
  error_code varchar(80),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_vehicle_provider_snapshot_id_run UNIQUE (id, lookup_run_id),
  UNIQUE (lookup_run_id, provider)
);

CREATE TABLE IF NOT EXISTS mot_odometer_observation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_run_id uuid NOT NULL REFERENCES vehicle_lookup_run(id) ON DELETE RESTRICT,
  provider_snapshot_id uuid NOT NULL,
  observation_id varchar(64) NOT NULL,
  raw_index integer NOT NULL CHECK (raw_index >= 0),
  data_source varchar(80) NOT NULL,
  mot_test_number varchar(40),
  completed_date_raw varchar(80),
  test_date date,
  test_result varchar(40),
  odometer_value_raw varchar(80),
  odometer_unit_raw varchar(40),
  odometer_result_type_raw varchar(40),
  registration_at_test varchar(40),
  stable_vehicle_identity varchar(100),
  normalized_miles numeric(14,3),
  episode_number integer,
  segment_number integer,
  selected_for_event boolean NOT NULL DEFAULT false,
  included_for_rate boolean NOT NULL DEFAULT false,
  decision_codes text[] NOT NULL DEFAULT '{}',
  warning_codes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_mot_observation_snapshot_run
    FOREIGN KEY (provider_snapshot_id, lookup_run_id)
    REFERENCES vehicle_provider_snapshot(id, lookup_run_id) ON DELETE RESTRICT,
  UNIQUE (provider_snapshot_id, raw_index),
  UNIQUE (lookup_run_id, observation_id)
);

CREATE TABLE IF NOT EXISTS mileage_estimate_result (
  lookup_run_id uuid PRIMARY KEY REFERENCES vehicle_lookup_run(id) ON DELETE RESTRICT,
  result_status varchar(20) NOT NULL CHECK (result_status IN ('observed','estimated','range_only','insufficient')),
  method varchar(40) NOT NULL CHECK (
    method IN ('observed_mot','bounded_interpolation','recent_rate_forecast',
               'cohort_assisted_forecast','cohort_assisted_backcast',
               'displayed_segment_only','none')
  ),
  odometer_meaning varchar(40) NOT NULL DEFAULT 'displayed_odometer' CHECK (odometer_meaning = 'displayed_odometer'),
  target_date date NOT NULL,
  observed_mileage bigint CHECK (observed_mileage IS NULL OR observed_mileage >= 0),
  estimated_mileage bigint CHECK (estimated_mileage IS NULL OR estimated_mileage >= 0),
  annual_rate_miles integer CHECK (annual_rate_miles IS NULL OR annual_rate_miles >= 0),
  range_low_mileage bigint CHECK (range_low_mileage IS NULL OR range_low_mileage >= 0),
  range_high_mileage bigint CHECK (range_high_mileage IS NULL OR range_high_mileage >= 0),
  interval_coverage numeric(5,4) CHECK (interval_coverage IS NULL OR interval_coverage BETWEEN 0 AND 1),
  calibration_profile_kind varchar(20) NOT NULL DEFAULT 'calibration',
  calibration_version varchar(100),
  cohort_prior_profile_kind varchar(20) NOT NULL DEFAULT 'cohort_prior',
  cohort_prior_version varchar(100),
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(warnings) = 'array'),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (range_low_mileage IS NULL OR range_high_mileage IS NULL OR range_low_mileage <= range_high_mileage),
  CONSTRAINT ck_mileage_estimate_calibration_kind
    CHECK (calibration_profile_kind = 'calibration'),
  CONSTRAINT ck_mileage_estimate_cohort_kind
    CHECK (cohort_prior_profile_kind = 'cohort_prior'),
  CONSTRAINT fk_mileage_estimate_calibration_profile
    FOREIGN KEY (calibration_profile_kind, calibration_version)
    REFERENCES mileage_model_profile(profile_kind, version) ON DELETE RESTRICT,
  CONSTRAINT fk_mileage_estimate_cohort_profile
    FOREIGN KEY (cohort_prior_profile_kind, cohort_prior_version)
    REFERENCES mileage_model_profile(profile_kind, version) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_vehicle_lookup_run_registration_retrieved
  ON vehicle_lookup_run (canonical_registration, retrieved_at DESC);
CREATE INDEX IF NOT EXISTS ix_vehicle_lookup_run_case_retrieved
  ON vehicle_lookup_run (case_id, retrieved_at DESC) WHERE case_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_mot_odometer_observation_run_date
  ON mot_odometer_observation (lookup_run_id, test_date, raw_index);

ALTER TABLE case_
  ADD COLUMN IF NOT EXISTS last_vehicle_lookup_run_id uuid,
  ADD COLUMN IF NOT EXISTS vehicle_lookup_status varchar(32),
  ADD COLUMN IF NOT EXISTS vehicle_lookup_warning text,
  ADD COLUMN IF NOT EXISTS vehicle_lookup_retryable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vehicle_lookup_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS vehicle_mileage_status varchar(20),
  ADD COLUMN IF NOT EXISTS vehicle_mileage_method varchar(40);

-- Reconcile a partial pre-release application. Existing rows (if any) remain
-- readable but cannot participate in replay until their hash/envelope fields
-- are present; all new writers provide the four values atomically.
ALTER TABLE vehicle_lookup_run
  ADD COLUMN IF NOT EXISTS idempotency_key varchar(200),
  ADD COLUMN IF NOT EXISTS request_sha256 char(64),
  ADD COLUMN IF NOT EXISTS response_sha256 char(64),
  ADD COLUMN IF NOT EXISTS response_envelope jsonb;

-- Earlier pre-release applications used version as the sole profile key. A
-- calibration and a cohort prior can legitimately share a release version, so
-- reconcile those installs to the kind-qualified identity before writers run.
ALTER TABLE mileage_estimate_result
  DROP CONSTRAINT IF EXISTS mileage_estimate_result_calibration_version_fkey,
  DROP CONSTRAINT IF EXISTS mileage_estimate_result_cohort_prior_version_fkey,
  ADD COLUMN IF NOT EXISTS calibration_profile_kind varchar(20) NOT NULL DEFAULT 'calibration',
  ADD COLUMN IF NOT EXISTS cohort_prior_profile_kind varchar(20) NOT NULL DEFAULT 'cohort_prior';

DO $$
DECLARE
  existing_primary_key text;
BEGIN
  SELECT pg_get_constraintdef(oid)
    INTO existing_primary_key
    FROM pg_constraint
   WHERE conrelid = 'mileage_model_profile'::regclass
     AND contype = 'p';

  IF existing_primary_key IS DISTINCT FROM 'PRIMARY KEY (profile_kind, version)' THEN
    ALTER TABLE mileage_model_profile DROP CONSTRAINT IF EXISTS mileage_model_profile_pkey;
    ALTER TABLE mileage_model_profile
      ADD CONSTRAINT mileage_model_profile_pkey PRIMARY KEY (profile_kind, version);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_mileage_estimate_calibration_kind') THEN
    ALTER TABLE mileage_estimate_result ADD CONSTRAINT ck_mileage_estimate_calibration_kind
      CHECK (calibration_profile_kind = 'calibration');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_mileage_estimate_cohort_kind') THEN
    ALTER TABLE mileage_estimate_result ADD CONSTRAINT ck_mileage_estimate_cohort_kind
      CHECK (cohort_prior_profile_kind = 'cohort_prior');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_mileage_estimate_calibration_profile') THEN
    ALTER TABLE mileage_estimate_result ADD CONSTRAINT fk_mileage_estimate_calibration_profile
      FOREIGN KEY (calibration_profile_kind, calibration_version)
      REFERENCES mileage_model_profile(profile_kind, version) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_mileage_estimate_cohort_profile') THEN
    ALTER TABLE mileage_estimate_result ADD CONSTRAINT fk_mileage_estimate_cohort_profile
      FOREIGN KEY (cohort_prior_profile_kind, cohort_prior_version)
      REFERENCES mileage_model_profile(profile_kind, version) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS ux_vehicle_lookup_run_idempotency
  ON vehicle_lookup_run (idempotency_key) WHERE idempotency_key IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_case_last_vehicle_lookup') THEN
    ALTER TABLE case_ ADD CONSTRAINT fk_case_last_vehicle_lookup
      FOREIGN KEY (last_vehicle_lookup_run_id)
      REFERENCES vehicle_lookup_run(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_case_vehicle_lookup_status') THEN
    ALTER TABLE case_ ADD CONSTRAINT ck_case_vehicle_lookup_status CHECK (
      vehicle_lookup_status IS NULL OR vehicle_lookup_status IN
        ('found','not_found','invalid_registration','temporarily_unavailable','configuration_error')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_case_vehicle_mileage_status') THEN
    ALTER TABLE case_ ADD CONSTRAINT ck_case_vehicle_mileage_status CHECK (
      vehicle_mileage_status IS NULL OR vehicle_mileage_status IN
        ('observed','estimated','range_only','insufficient')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_case_vehicle_mileage_method') THEN
    ALTER TABLE case_ ADD CONSTRAINT ck_case_vehicle_mileage_method CHECK (
      vehicle_mileage_method IS NULL OR vehicle_mileage_method IN
        ('observed_mot','bounded_interpolation','recent_rate_forecast',
         'cohort_assisted_forecast','cohort_assisted_backcast',
         'displayed_segment_only','none')
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_case_last_vehicle_lookup
  ON case_ (last_vehicle_lookup_run_id) WHERE last_vehicle_lookup_run_id IS NOT NULL;

-- Reconcile an earlier partial application of this idempotent delta. The
-- composite relationship prevents an observation from claiming one lookup run
-- while pointing at a provider snapshot captured by another.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_vehicle_provider_snapshot_id_run'
      AND conrelid = 'vehicle_provider_snapshot'::regclass
  ) THEN
    ALTER TABLE vehicle_provider_snapshot
      ADD CONSTRAINT uq_vehicle_provider_snapshot_id_run UNIQUE (id, lookup_run_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_mot_observation_snapshot_run'
      AND conrelid = 'mot_odometer_observation'::regclass
  ) THEN
    ALTER TABLE mot_odometer_observation
      ADD CONSTRAINT fk_mot_observation_snapshot_run
      FOREIGN KEY (provider_snapshot_id, lookup_run_id)
      REFERENCES vehicle_provider_snapshot(id, lookup_run_id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mileage_model_profile','vehicle_lookup_run','vehicle_provider_snapshot',
    'mot_odometer_observation','mileage_estimate_result'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'p_' || t || '_select') THEN
      EXECUTE format($p$CREATE POLICY p_%1$s_select ON %1$I FOR SELECT
        USING (current_setting('app.role', true) IN ('staff','admin'));$p$, t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'p_' || t || '_insert') THEN
      EXECUTE format($p$CREATE POLICY p_%1$s_insert ON %1$I FOR INSERT
        WITH CHECK (current_setting('app.role', true) IN ('staff','admin'));$p$, t);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cespk_app') THEN
    GRANT SELECT, INSERT ON mileage_model_profile TO cespk_app;
    GRANT SELECT, INSERT ON vehicle_lookup_run TO cespk_app;
    GRANT SELECT, INSERT ON vehicle_provider_snapshot TO cespk_app;
    GRANT SELECT, INSERT ON mot_odometer_observation TO cespk_app;
    GRANT SELECT, INSERT ON mileage_estimate_result TO cespk_app;
  END IF;
END $$;

COMMIT;
