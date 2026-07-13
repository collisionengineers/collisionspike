export const VEHICLE_ENRICHMENT_CANDIDATE_SQL = `
  SELECT c.id, c.vrm, c.eva_vehicle_model, c.eva_mileage,
         c.vehicle_lookup_status, c.vehicle_mileage_status,
         c.vehicle_lookup_warning, c.vehicle_lookup_attempted_at
    FROM case_ c
    JOIN choice_case_status cs ON cs.code = c.status_code
   WHERE cs.name NOT IN ('eva_submitted','box_synced','error','removed','done')
     AND NULLIF(btrim(c.vrm), '') IS NOT NULL
     AND (NULLIF(btrim(c.eva_vehicle_model), '') IS NULL OR
          NULLIF(btrim(c.eva_mileage), '') IS NULL OR
          NOT (btrim(c.eva_mileage) ~ '^[0-9]{1,20}$' OR
               btrim(c.eva_mileage) ~ '^[0-9]{1,3}(,[0-9]{3})+$'))
   ORDER BY c.created_at, c.id
   LIMIT $1`;

export function defensibleRegistration(raw) {
  const value = String(raw ?? '').trim().toUpperCase();
  const compact = value.replaceAll(' ', '');
  return /^[A-Z0-9 ]+$/.test(value) && compact.length >= 2 && compact.length <= 8;
}
