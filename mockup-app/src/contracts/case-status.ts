/* ============================================================
   Collision Engineers — Case status contract (CANONICAL).

   Re-implements collisioncc `src/lib/case-status.ts` `statusForReviewCase`
   on the collisionspike domain model. The 11-value `CaseStatus` union is the
   authority used by the prototype (`mockup-app/src/mock/types.ts`) and the
   Dataverse status choice set; both MUST reconcile 1:1 against this file.

   PURE + DETERMINISTIC + FRAMEWORK-FREE. No React, no I/O, no live calls.
   The guard operates over small STRUCTURAL inputs (not the full React-coupled
   `Case`), so the prototype `Case`/`EvaFields`/`Evidence` shapes satisfy it
   without this contract depending on them.
   ============================================================ */

import {
  EVA_FIELD_ORDER,
  type EvaFieldKey,
} from './eva-export';
import {
  validateEvaImageRules,
  type ImageRuleEvidence,
} from './image-rules';

/* ----------  The 11-value status union (the prototype authority)  ---------- */
export type CaseStatus =
  | 'new_email'
  | 'ingested'
  | 'needs_review'
  | 'missing_required_fields'
  | 'missing_images'
  | 'duplicate_risk'
  | 'linked_to_instruction'
  | 'ready_for_eva'
  | 'eva_submitted'
  | 'box_synced'
  | 'error';

/** All 11 values, frozen in declaration order (drives the choice-set parity test). */
export const CASE_STATUSES: readonly CaseStatus[] = [
  'new_email',
  'ingested',
  'needs_review',
  'missing_required_fields',
  'missing_images',
  'duplicate_risk',
  'linked_to_instruction',
  'ready_for_eva',
  'eva_submitted',
  'error',
  'box_synced',
] as const;

/**
 * Terminal statuses — once a Case reaches one, the guard never moves it.
 * Per Phase-1 plan §5.4 the terminals are `eva_submitted`, `box_synced`, and
 * `error`; these reconcile 1:1 with the Dataverse choice set's
 * `stateMachine.terminals` (dataverse/choicesets/case-status.json), asserted by
 * `dataverse/verify-parity.mjs`. `linked_to_instruction` and `duplicate_risk`
 * are BRANCH states set by the dedup flow, NOT terminals — the guard may
 * recompute a linked/duplicate case once its fields/images resolve.
 */
export const TERMINAL_STATUSES: readonly CaseStatus[] = [
  'eva_submitted',
  'box_synced',
  'error',
] as const;

const TERMINAL_SET: ReadonlySet<CaseStatus> = new Set(TERMINAL_STATUSES);

export function isTerminalStatus(status: CaseStatus): boolean {
  return TERMINAL_SET.has(status);
}

/* ----------  Structural input for the guard  ----------
   Minimal shape the guard needs. The prototype `Case` satisfies this: its
   `evaFields[key]` carries `{ value, reviewState }` and its `evidence[]`
   carries the image-rule fields. Kept structural so this contract imports
   nothing from `mock/`. */

/** Per-field review state — superset-compatible with the prototype `ReviewState`. */
export type FieldReviewState =
  | 'not_required'
  | 'needs_review'
  | 'reviewed'
  | 'conflict';

/** The minimum a single EVA field must expose for status evaluation. */
export interface ReviewableField {
  value: string;
  reviewState: FieldReviewState;
}

/** The minimum a Case must expose for status evaluation. */
export interface StatusEvaluationInput {
  status: CaseStatus;
  /** The 12 EVA fields, keyed by `EvaFieldKey` (camelCase). */
  evaFields: Record<EvaFieldKey, ReviewableField>;
  /** Evidence usable by the image rules. */
  evidence: readonly ImageRuleEvidence[];
}

/* ----------  Required-field check (re-implements payload validation)  ----------
   collisioncc gates on `validateEvaCasePayload`; here the binding required set
   is the `required: true` fields in `EVA_FIELD_ORDER`. A required field fails
   when its trimmed value is empty. (Inspection-address *content* shape is
   schema-validated separately by eva-payload.schema.json.) */

/** Keys of the required EVA fields, in contract order. */
export const REQUIRED_FIELD_KEYS: readonly EvaFieldKey[] = EVA_FIELD_ORDER.filter(
  (d) => d.required,
).map((d) => d.key);

/** Required-field keys whose trimmed value is empty. Empty array = all present. */
export function missingRequiredFieldKeys(
  fields: Record<EvaFieldKey, ReviewableField>,
): EvaFieldKey[] {
  return REQUIRED_FIELD_KEYS.filter((key) => {
    const field = fields[key];
    return !field || field.value.trim().length === 0;
  });
}

/** Field keys left in an unresolved `conflict` review state (any field, not just required). */
export function conflictFieldKeys(
  fields: Record<EvaFieldKey, ReviewableField>,
): EvaFieldKey[] {
  return EVA_FIELD_ORDER.map((d) => d.key).filter(
    (key) => fields[key]?.reviewState === 'conflict',
  );
}

/* ----------  The guard (re-implements `statusForReviewCase`)  ----------
   Guard order is load-bearing and MUST match collisioncc:
     1. terminal? -> return it unchanged (terminal-lock)
     2. required fields missing -> 'missing_required_fields'
     3. image rules fail        -> 'missing_images'
     4. open review issues      -> 'needs_review'  (conflicts, or any field needs_review)
     5. otherwise               -> 'ready_for_eva'

   This computes the *derived review status*. It deliberately does NOT invent
   `duplicate_risk` / `linked_to_instruction` (set by the dedup flow) nor the
   submit terminals (`eva_submitted` / `box_synced`, set by finalization); those
   are handled upstream and protected by the terminal-lock. */
export function statusForReviewCase(input: StatusEvaluationInput): CaseStatus {
  if (isTerminalStatus(input.status)) return input.status;

  if (missingRequiredFieldKeys(input.evaFields).length > 0) {
    return 'missing_required_fields';
  }

  if (validateEvaImageRules(input.evidence).length > 0) {
    return 'missing_images';
  }

  if (hasOpenReviewIssues(input.evaFields)) {
    return 'needs_review';
  }

  return 'ready_for_eva';
}

/** Open review issues = any field still `needs_review`, or any field in `conflict`. */
export function hasOpenReviewIssues(
  fields: Record<EvaFieldKey, ReviewableField>,
): boolean {
  return EVA_FIELD_ORDER.some((d) => {
    const s = fields[d.key]?.reviewState;
    return s === 'needs_review' || s === 'conflict';
  });
}
