-- =============================================================================
-- TKT-152 -- immutable vehicle lookup + MOT estimator evidence (idempotent delta)
-- Apply before a TKT-151 caller starts persisting vehicle-data.v1.
-- Fresh-build counterpart: ../200_vehicle_data.sql.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS mileage_model_profile (
  version varchar(100) PRIMARY KEY,
  profile_kind varchar(20) NOT NULL CHECK (profile_kind IN ('cohort_prior','calibration')),
  dataset_digest char(64) NOT NULL CHECK (dataset_digest ~ '^[0-9a-f]{64}$'),
  profile jsonb NOT NULL CHECK (jsonb_typeof(profile) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
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
  UNIQUE (lookup_run_id, provider)
);

CREATE TABLE IF NOT EXISTS mot_odometer_observation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_run_id uuid NOT NULL REFERENCES vehicle_lookup_run(id) ON DELETE RESTRICT,
  provider_snapshot_id uuid NOT NULL REFERENCES vehicle_provider_snapshot(id) ON DELETE RESTRICT,
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
  calibration_version varchar(100) REFERENCES mileage_model_profile(version) ON DELETE RESTRICT,
  cohort_prior_version varchar(100) REFERENCES mileage_model_profile(version) ON DELETE RESTRICT,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(warnings) = 'array'),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (range_low_mileage IS NULL OR range_high_mileage IS NULL OR range_low_mileage <= range_high_mileage)
);

CREATE INDEX IF NOT EXISTS ix_vehicle_lookup_run_registration_retrieved
  ON vehicle_lookup_run (canonical_registration, retrieved_at DESC);
CREATE INDEX IF NOT EXISTS ix_vehicle_lookup_run_case_retrieved
  ON vehicle_lookup_run (case_id, retrieved_at DESC) WHERE case_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_mot_odometer_observation_run_date
  ON mot_odometer_observation (lookup_run_id, test_date, raw_index);

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
