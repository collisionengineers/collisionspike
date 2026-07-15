/** improvement-signals — reusable feature support. */

import { query } from '../../platform/db/client.js';
import { type Row } from '../../shared/mapping/index.js';

export async function writeImprovementSignal(
  row: Row,
  fieldName: string,
  originalValue: string,
  correctedValue: string,
  actor: string | undefined,
  reason: string,
): Promise<void> {
  try {
    await query(
      `INSERT INTO improvement_signal
         (name, case_id, work_provider_id, field_name, original_value, corrected_value,
          original_provenance, actor, occurred_at, affects_eva_readiness, classification_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), false, 100000000)`,
      [
        `Inbound ${fieldName} override: ${originalValue || '(none)'} -> ${correctedValue}`,
        row.case_id ?? null,
        row.work_provider_id ?? null,
        `inbound.${fieldName}`,
        originalValue || null,
        correctedValue,
        reason || 'classifier suggestion',
        actor ?? null,
      ],
    );
  } catch {
    /* improvement_signal is feedback provenance — failure must not block the reclassify. */
  }
}
