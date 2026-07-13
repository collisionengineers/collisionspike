import type { VehicleDataEnrichmentResponse, VehicleDataWarning } from '@cs/domain';
import { tx, type TxQuery } from './db.js';
import { combineMakeModel } from './enrichment-map.js';

type CaseVehicleRow = {
  id: string;
  eva_vehicle_model: string | null;
  eva_mileage: string | null;
  eva_mileage_unit: string | null;
};

export interface PersistedVehicleData {
  applied: string[];
  warning?: string;
  retryable: boolean;
}

const LOOKUP_MESSAGES: Record<VehicleDataEnrichmentResponse['lookup']['status'], string> = {
  found: 'Vehicle details could not be completed from the available history.',
  not_found: 'No vehicle record was found for this registration.',
  invalid_registration: 'Check the registration and try again.',
  temporarily_unavailable: 'Vehicle details are temporarily unavailable. Try again.',
  configuration_error: 'Vehicle lookup is unavailable. Ask a supervisor to check it.',
};

function currentMileage(result: VehicleDataEnrichmentResponse): number | undefined {
  if (result.mileage.status !== 'observed' && result.mileage.status !== 'estimated') return undefined;
  return result.current_mileage ?? result.mileage.observed_mileage ?? result.mileage.estimated_mileage ?? undefined;
}

function blockingWarning(result: VehicleDataEnrichmentResponse): VehicleDataWarning | undefined {
  return (result.mileage.warnings ?? []).find((warning) => warning.severity === 'blocking');
}

function staffWarning(result: VehicleDataEnrichmentResponse): string | undefined {
  const blocking = blockingWarning(result);
  if (blocking?.message) return blocking.message;
  if (result.lookup.status !== 'found') return LOOKUP_MESSAGES[result.lookup.status];
  if (result.mileage.status === 'range_only' || result.mileage.status === 'insufficient') {
    return result.mileage.reason?.trim() || LOOKUP_MESSAGES.found;
  }
  return undefined;
}

async function insertProfile(
  q: TxQuery,
  kind: 'cohort_prior' | 'calibration',
  version: string | undefined,
  digest: string | undefined,
  profile: unknown,
): Promise<void> {
  if (!version || !digest) return;
  await q(
    `INSERT INTO mileage_model_profile (version, profile_kind, dataset_digest, profile)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (version) DO NOTHING`,
    [version, kind, digest, JSON.stringify(profile)],
  );
  const existing = await q<{ profile_kind: string; dataset_digest: string }>(
    'SELECT profile_kind, dataset_digest FROM mileage_model_profile WHERE version = $1',
    [version],
  );
  if (!existing[0] || existing[0].profile_kind !== kind || existing[0].dataset_digest !== digest) {
    throw new Error('mileage model profile version conflicts with persisted provenance');
  }
}

async function insertFieldSource(
  q: TxQuery,
  caseId: string,
  runId: string,
  fieldName: 'vehicleModel' | 'mileage' | 'mileageUnit',
  value: string,
  sourceLabel: string,
): Promise<void> {
  await q(
    `INSERT INTO field_level_provenance
       (name, case_id, field_name, value, source_type_code, source_label,
        source_reference, review_state_code)
     SELECT $1, $2, $3, $4, 100000005, $5, $6, 100000000
      WHERE NOT EXISTS (
        SELECT 1 FROM field_level_provenance
         WHERE case_id = $2 AND field_name = $3 AND source_reference = $6
      )`,
    [`${caseId}:${fieldName}:${runId}`.slice(0, 200), caseId, fieldName, value, sourceLabel, runId],
  );
}

/**
 * Persist one validated canonical response atomically. Provider evidence and the
 * estimate are append-only/idempotent by run id; only the case's current summary
 * and empty compatibility fields are updated.
 */
export async function persistVehicleData(
  caseId: string,
  result: VehicleDataEnrichmentResponse,
  requestContext: Record<string, unknown> = {},
): Promise<PersistedVehicleData> {
  return tx(async (q) => {
    const cases = await q<CaseVehicleRow>(
      `SELECT id, eva_vehicle_model, eva_mileage, eva_mileage_unit
         FROM case_ WHERE id = $1 FOR UPDATE`,
      [caseId],
    );
    const current = cases[0];
    if (!current) throw new Error('case not found');

    const interval = result.mileage.prediction_interval;
    const prior = result.mileage.prior;
    await insertProfile(
      q,
      'calibration',
      interval?.calibration_version,
      interval?.dataset_digest,
      interval ?? {},
    );
    await insertProfile(q, 'cohort_prior', prior?.version, prior?.dataset_digest, prior ?? {});

    await q(
      `INSERT INTO vehicle_lookup_run
         (id, case_id, contract_version, algorithm_version, requested_registration,
          canonical_registration, target_date, lookup_status, retrieved_at, request_context)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [
        result.lookup.run_id,
        caseId,
        result.contract_version,
        result.algorithm_version,
        result.lookup.requested_registration,
        result.lookup.canonical_registration,
        result.lookup.target_date,
        result.lookup.status,
        result.lookup.retrieved_at,
        JSON.stringify(requestContext),
      ],
    );
    const runs = await q<{ case_id: string | null }>('SELECT case_id FROM vehicle_lookup_run WHERE id = $1', [result.lookup.run_id]);
    if (!runs[0] || runs[0].case_id !== caseId) {
      throw new Error('vehicle lookup run is already assigned to another case');
    }

    const snapshotIds = new Map<string, string>();
    for (const snapshot of result.provider_snapshots) {
      const inserted = await q<{ id: string }>(
        `INSERT INTO vehicle_provider_snapshot
           (lookup_run_id, provider, provider_status, retrieved_at, payload_sha256,
            raw_payload, error_class, error_code)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
         ON CONFLICT (lookup_run_id, provider) DO NOTHING
         RETURNING id`,
        [
          result.lookup.run_id,
          snapshot.provider,
          snapshot.status,
          snapshot.retrieved_at,
          snapshot.payload_sha256,
          snapshot.raw_payload == null ? null : JSON.stringify(snapshot.raw_payload),
          snapshot.error_class,
          snapshot.error_code,
        ],
      );
      const existing = inserted[0] ?? (await q<{ id: string }>(
        'SELECT id FROM vehicle_provider_snapshot WHERE lookup_run_id = $1 AND provider = $2',
        [result.lookup.run_id, snapshot.provider],
      ))[0];
      if (!existing) throw new Error('vehicle provider snapshot was not persisted');
      const persistedSnapshots = await q<{ id: string; provider_status: string; payload_sha256: string | null }>(
        `SELECT id, provider_status, payload_sha256 FROM vehicle_provider_snapshot
          WHERE lookup_run_id = $1 AND provider = $2`,
        [result.lookup.run_id, snapshot.provider],
      );
      if (
        !persistedSnapshots[0] ||
        persistedSnapshots[0].provider_status !== snapshot.status ||
        persistedSnapshots[0].payload_sha256 !== snapshot.payload_sha256
      ) throw new Error('vehicle provider snapshot conflicts with persisted run evidence');
      snapshotIds.set(snapshot.provider, existing.id);
    }

    const motSnapshotId = snapshotIds.get('dvsa_mot_history_v1');
    if (motSnapshotId) {
      for (const observation of result.mileage.evidence.observations) {
        await q(
          `INSERT INTO mot_odometer_observation
             (lookup_run_id, provider_snapshot_id, observation_id, raw_index, data_source,
              mot_test_number, completed_date_raw, test_date, test_result, odometer_value_raw,
              odometer_unit_raw, odometer_result_type_raw, registration_at_test,
              stable_vehicle_identity, normalized_miles, selected_for_event,
              included_for_rate, decision_codes, warning_codes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
           ON CONFLICT DO NOTHING`,
          [
            result.lookup.run_id,
            motSnapshotId,
            observation.observation_id,
            observation.raw_index,
            observation.source,
            observation.mot_test_number,
            observation.test_date,
            observation.test_date,
            observation.test_result,
            observation.odometer_value_raw,
            observation.odometer_unit_raw,
            observation.odometer_result_type_raw,
            observation.registration_at_test,
            observation.stable_vehicle_identity,
            observation.normalized_miles,
            observation.decisions.includes('selected_for_event'),
            observation.decisions.includes('included_for_rate'),
            observation.decisions,
            observation.warnings,
          ],
        );
      }
    }

    const range = result.mileage.prediction_interval ?? result.mileage.range;
    await q(
      `INSERT INTO mileage_estimate_result
         (lookup_run_id, result_status, method, odometer_meaning, target_date,
          observed_mileage, estimated_mileage, annual_rate_miles,
          range_low_mileage, range_high_mileage, interval_coverage,
          calibration_version, cohort_prior_version, warnings, evidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb)
       ON CONFLICT (lookup_run_id) DO NOTHING`,
      [
        result.lookup.run_id,
        result.mileage.status,
        result.mileage.method,
        result.mileage.odometer_meaning,
        result.mileage.target_date,
        result.mileage.observed_mileage ?? null,
        result.mileage.estimated_mileage ?? null,
        result.mileage.annual_rate_miles ?? null,
        range?.lower_mileage ?? null,
        range?.upper_mileage ?? null,
        result.mileage.prediction_interval?.coverage ?? null,
        result.mileage.prediction_interval?.calibration_version ?? null,
        result.mileage.prior?.version ?? null,
        JSON.stringify(result.mileage.warnings),
        JSON.stringify(result.mileage.evidence),
      ],
    );

    const applied: string[] = [];
    const model = combineMakeModel(result.make?.trim() ?? '', result.vehicle_model?.trim() ?? '');
    const mileage = currentMileage(result);
    if (model && !current.eva_vehicle_model?.trim()) {
      await q('UPDATE case_ SET eva_vehicle_model = $2 WHERE id = $1', [caseId, model.slice(0, 200)]);
      await insertFieldSource(q, caseId, result.lookup.run_id, 'vehicleModel', model.slice(0, 200), 'Vehicle record');
      applied.push('vehicleModel');
    }
    if (mileage !== undefined && !current.eva_mileage?.trim()) {
      const exactMileage = String(mileage);
      await q(
        `UPDATE case_ SET eva_mileage = $2, eva_mileage_unit = 'Miles' WHERE id = $1`,
        [caseId, exactMileage],
      );
      await insertFieldSource(q, caseId, result.lookup.run_id, 'mileage', exactMileage, 'MOT history estimate');
      await insertFieldSource(q, caseId, result.lookup.run_id, 'mileageUnit', 'Miles', 'MOT history estimate');
      applied.push('mileage', 'mileageUnit');
    }

    const warning = staffWarning(result);
    const retryable = result.lookup.status === 'temporarily_unavailable';
    await q(
      `UPDATE case_
          SET last_vehicle_lookup_run_id = $2,
              vehicle_lookup_status = $3,
              vehicle_lookup_warning = $4,
              vehicle_lookup_retryable = $5,
              vehicle_lookup_attempted_at = $6,
              vehicle_mileage_status = $7,
              vehicle_mileage_method = $8,
              updated_at = now()
        WHERE id = $1`,
      [
        caseId,
        result.lookup.run_id,
        result.lookup.status,
        warning ?? null,
        retryable,
        result.lookup.retrieved_at,
        result.mileage.status,
        result.mileage.method,
      ],
    );
    return { applied, ...(warning ? { warning } : {}), retryable };
  });
}
