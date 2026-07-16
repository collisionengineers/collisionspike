/**
 * services/data-api/src/features/vehicle/enrichment-map.ts — pure mappers for the advisory DVSA/DVLA enrichment
 * result onto the case's EVA columns. Kept out of the function module so it is unit-testable
 * without triggering app.http() registration.
 */

/**
 * Fold an enrichment make + model into the single EVA vehicle-model field (#2). There is no
 * separate `make` column on case_, so make+model combine into eva_vehicle_model. Guards the
 * "FORD FORD FOCUS" case where the DVSA model already leads with the make.
 */
export function combineMakeModel(make: string, model: string): string {
  const mk = (make ?? '').trim();
  const md = (model ?? '').trim();
  if (mk && md) {
    return md.toUpperCase().startsWith(mk.toUpperCase()) ? md : `${mk} ${md}`;
  }
  return md || mk || '';
}
