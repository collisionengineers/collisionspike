/**
 * services/data-api/src/features/cases/inspection-prefill.ts — provider-policy inspection pre-fill (TKT-109 / TKT-129).
 *
 * For a work provider whose operator-designated `inspection_location_policy` is
 * `always_image_based` (evidenced image-led providers — QDOS/PCH/AX/SBL per the TKT-075
 * corpus run: 99.9% / 99.6% / 99.2% / 99.5% image-based), the inspection field on an
 * applicable case is AUTO-COMPLETED as "Image Based Assessment" instead of starting blank:
 *   - `eva_inspection_address` := the IMAGE_BASED_LITERAL (EVA field 9's alternative form)
 *   - `inspection_decision_code` := image_based (100000002)
 * so the readiness checklist marks the inspection item Done without manual entry.
 *
 * INVARIANTS (the operator-direction shape, 2026-07-08):
 *   - FILL-IF-EMPTY ONLY: the guarded UPDATE fires only while the address is still empty
 *     AND no inspection decision has been recorded — it can never clobber a staff pick,
 *     and once staff override to a physical address it never re-fires.
 *   - ALWAYS WITH A REASON: the recorded reason is PREFILL_REASON ("Provider policy:
 *     image-based assessment") — carried on the provenance row and the audit event, so no
 *     image-based outcome exists without a stated reason (the address-policy invariant's
 *     spirit; the "explicit reviewer decision" half is superseded for always_image_based
 *     providers by the 2026-07-08 operator direction — see the dated amendment in
 *     ADR-0013 and the TKT-129 changes note).
 *   - AUDITED: one `inspection_override` audit row per fill (actor = the triggering staff
 *     identity when there is one, else the system seam).
 *   - STAFF-CHANGEABLE: staff can still pick/search a physical address (the picker
 *     overwrites the literal + records a manual decision) — nothing here locks the field.
 *   - NEVER on a terminal case (the caller checks; the guard here re-checks decision+empty).
 *
 * Providers WITHOUT the always_image_based policy keep the manual flow untouched.
 */

import { inspectionDecisionCodec, reviewStateCodec, sourceTypeCodec } from '@cs/domain/codecs';
import type { Case } from '@cs/domain';
import { isTerminalStatus, IMAGE_BASED_LITERAL } from '@cs/domain';
import { query } from '../../platform/db/client.js';
import { AUDIT_ACTION, writeAudit } from '../../shared/audit.js';

/** The recorded reason every policy pre-fill carries (audit + provenance). */
export const PREFILL_REASON = 'Provider policy: image-based assessment';

/** Provenance label for the pre-filled inspectionAddress field. */
const PREFILL_SOURCE_LABEL = 'Provider policy (image-based)';

const IMAGE_BASED_CODE = inspectionDecisionCodec.toInt('image_based'); // 100000002
const UNKNOWN_DECISION_CODE = inspectionDecisionCodec.toInt('unknown'); // 100000003

/**
 * PURE eligibility check — exported for unit tests and so both recomputeStatus seams share
 * one definition of "applicable": an always_image_based provider, a still-empty inspection
 * address, no recorded decision, and a non-terminal status.
 */
export function isPrefillApplicable(
  c: Pick<Case, 'status' | 'inspectionDecision' | 'evaFields' | 'providerInspectionPolicy'>,
): boolean {
  return (
    c.providerInspectionPolicy === 'always_image_based' &&
    !isTerminalStatus(c.status) &&
    c.inspectionDecision === 'unknown' &&
    c.evaFields.inspectionAddress.value.trim().length === 0
  );
}

/**
 * Perform the guarded pre-fill for one case. Returns true when THIS call filled the field
 * (the UPDATE's own WHERE re-checks empty+undecided, so concurrent evaluators can't
 * double-fill and a just-made staff pick always wins). Best-effort on the supplementary
 * writes: a provenance/audit failure never undoes the durable fill.
 */
export async function prefillImageBasedInspection(
  caseId: string,
  actor?: string,
): Promise<boolean> {
  const updated = await query<{ id: string }>(
    `UPDATE case_
        SET eva_inspection_address = $2,
            inspection_decision_code = $3,
            updated_at = now()
      WHERE id = $1
        AND COALESCE(btrim(eva_inspection_address), '') = ''
        AND (inspection_decision_code IS NULL OR inspection_decision_code = $4)
      RETURNING id`,
    [caseId, IMAGE_BASED_LITERAL, IMAGE_BASED_CODE, UNKNOWN_DECISION_CODE],
  );
  if (!updated[0]) return false;

  // Provenance: one corpus-sourced row for inspectionAddress (fill-if-absent — a staff
  // edit later overwrites it via the manual-provenance upsert like any other field).
  // review_state 'reviewed': the value is the OPERATOR-designated policy default (signed
  // off at designation time), not an extraction awaiting review — leaving the DB default
  // 'needs_review' would flag the very field the pre-fill just completed.
  try {
    const corpus = sourceTypeCodec.toInt('corpus') ?? 100000003;
    const reviewed = reviewStateCodec.toInt('reviewed') ?? 100000002;
    const existing = await query<{ id: string }>(
      `SELECT id FROM field_level_provenance WHERE case_id = $1 AND field_name = $2`,
      [caseId, 'inspectionAddress'],
    );
    if (existing.length === 0) {
      await query(
        `INSERT INTO field_level_provenance
           (name, case_id, field_name, value, source_type_code, source_label, review_state_code)
         VALUES ($1, $2, 'inspectionAddress', $3, $4, $5, $6)`,
        [
          `${caseId}:inspectionAddress`,
          caseId,
          IMAGE_BASED_LITERAL,
          corpus,
          PREFILL_SOURCE_LABEL,
          reviewed,
        ],
      );
    }
  } catch {
    /* provenance is supplementary — the fill already stands */
  }

  await writeAudit({
    action: AUDIT_ACTION.inspection_override,
    caseId,
    summary: 'Inspection recorded as Image Based Assessment (provider policy)',
    before: { inspectionAddress: '', decisionMode: 'unknown' },
    after: {
      inspectionAddress: IMAGE_BASED_LITERAL,
      decisionMode: 'image_based',
      reason: PREFILL_REASON,
      source: 'provider_policy',
    },
    ...(actor ? { actor } : {}),
  });

  return true;
}
