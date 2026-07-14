-- Read-only TKT-151 census. Run before remediation and again after it.
WITH active AS (
  SELECT
    c.id,
    c.vrm,
    COALESCE(wp.display_name, c.eva_work_provider, '(unknown)') AS provider,
    COALESCE(ick.name, 'unknown') AS intake_path,
    NULLIF(btrim(c.eva_vehicle_model), '') AS vehicle_model,
    NULLIF(btrim(c.eva_mileage), '') AS mileage,
    c.vehicle_lookup_status,
    c.vehicle_mileage_status,
    c.vehicle_lookup_warning,
    c.vehicle_lookup_attempted_at
  FROM case_ c
  JOIN choice_case_status cs ON cs.code = c.status_code
  LEFT JOIN work_provider wp ON wp.id = c.work_provider_id
  LEFT JOIN choice_intake_channel_kind ick ON ick.code = c.intake_channel_kind_code
  WHERE cs.name NOT IN ('eva_submitted','box_synced','error','removed','done')
    AND NULLIF(btrim(c.vrm), '') IS NOT NULL
    AND (
      NULLIF(btrim(c.eva_vehicle_model), '') IS NULL OR
      NULLIF(btrim(c.eva_mileage), '') IS NULL
    )
)
SELECT
  provider,
  intake_path,
  COALESCE(vehicle_lookup_status, 'never_attempted') AS lookup_outcome,
  COALESCE(vehicle_mileage_status, 'no_result') AS mileage_outcome,
  count(*) AS case_count,
  count(*) FILTER (WHERE vehicle_model IS NULL) AS missing_vehicle_model,
  count(*) FILTER (WHERE mileage IS NULL) AS missing_mileage,
  min(vehicle_lookup_attempted_at) AS earliest_attempt,
  max(vehicle_lookup_attempted_at) AS latest_attempt
FROM active
GROUP BY provider, intake_path,
         COALESCE(vehicle_lookup_status, 'never_attempted'),
         COALESCE(vehicle_mileage_status, 'no_result')
ORDER BY case_count DESC, provider, intake_path;
