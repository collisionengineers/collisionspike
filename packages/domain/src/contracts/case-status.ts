/* ============================================================
   Collision Engineers — Case status contract (CANONICAL).

   Re-implements collisioncc `src/lib/case-status.ts` `statusForReviewCase`
   on the collisionspike domain model. The 13-value `CaseStatus` union is the
   authority used by the prototype (`mockup-app/src/mock/types.ts`) and the
   status choice set; both MUST reconcile 1:1 against this file.

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
  MIN_ACCEPTED_IMAGES,
  evaluateEvaImageReadiness,
  acceptedEvaImages,
  type ImageRuleEvidence,
} from './image-rules';

/* ----------  The 13-value status union (the prototype authority)  ----------
   `removed` (append-only) is the Superuser SOFT-REMOVE terminal
   (work-todo-spike: ui-changes/delete-case): the case row + audit trail survive,
   PII is anonymised, and the status is locked here so the guard never re-promotes
   it and dedup/merge never targets it.
   `done` (13th, TKT-094 / ADR-0023) is the post-EVA DELIVERY terminal: the CE
   report has been delivered back to the work provider. It comes AFTER
   `eva_submitted` and is only ever written explicitly (manual "Mark report
   delivered" or a TKT-095 detector) — the guard never computes it. */
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
  | 'error'
  | 'removed'
  | 'done';

/** All 13 values, frozen in declaration order (drives the choice-set parity test). */
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
  'removed',
  'done',
] as const;

/**
 * Terminal statuses — once a Case reaches one, the guard never moves it.
 * Per Phase-1 plan §5.4 the terminals are `eva_submitted`, `box_synced`, and
 * `error`, plus `removed` (the Superuser soft-remove terminal, work-todo-spike)
 * and `done` (the post-EVA delivery terminal, TKT-094 / ADR-0023 — written only
 * by an explicit mark-done transition, guarded `WHERE status = eva_submitted`);
 * these reconcile 1:1 with the choice set's `stateMachine.terminals`
 * (`packages/domain/src/data/choicesets/case-status.json`), asserted by
 * `migration/assets/verify-parity-pg.mjs`. `linked_to_instruction` and `duplicate_risk`
 * are BRANCH states set by the dedup flow, NOT terminals — the guard may
 * recompute a linked/duplicate case once its fields/images resolve — EXCEPT a
 * merge-retired case: when the `duplicate_keys.mergedInto` survivor marker is
 * present the guard preserves `linked_to_instruction` instead of recomputing
 * (the TKT-141 retired-lock below; the marker, not the status, is what makes
 * retirement durable).
 * NOTE the terminal-lock semantics: the guard returns a terminal UNCHANGED, so
 * `eva_submitted → done` is legal precisely because it is an explicit write,
 * never a guard recompute.
 */
export const TERMINAL_STATUSES: readonly CaseStatus[] = [
  'eva_submitted',
  'box_synced',
  'error',
  'removed',
  'done',
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
  /** Evidence usable by the image rules (+ instruction-kind rows for FIX-3). */
  evidence: readonly ImageRuleEvidence[];
  /**
   * The saved inspection choice. A non-empty address alone is not a decision:
   * the handler must have explicitly chosen a physical address or Image Based
   * Assessment before the case can become ready.
   */
  inspectionDecision:
    | 'confirmed_physical'
    | 'manual'
    | 'image_based'
    | 'unknown';
  /**
   * Count of active instruction-kind evidence rows (FIX-3). When omitted it is
   * DERIVED from `evidence` (items whose `kind === 'instruction'`). Lets the tree
   * tell an instructions-only case from a genuinely-empty one.
   */
  instructionCount?: number;
  /**
   * Can the case be identified at all? In the live flow: work_provider OR vrm OR
   * caseref OR claimant present. When omitted it is DERIVED conservatively from
   * the EVA fields available here (workProvider OR claimantName non-empty); pass
   * it explicitly when vrm/caseref identity is known (they are NOT EVA fields).
   */
  hasIdentity?: boolean;
  /**
   * Survivor case id when THIS case was retired by a staff/data merge (TKT-092
   * writes `{"mergedInto": <survivor>}` into `duplicate_keys`; surfaced as
   * `Case.mergedInto`). Present (non-blank) => the case is resolved work: the
   * guard preserves the retired `linked_to_instruction` state instead of
   * recomputing from fields/images (the TKT-141 retired-lock). Callers
   * recomputing an EXISTING case must pass it; case-create paths have none.
   */
  mergedInto?: string;
  /** A staff Manual Intake case whose selected source/evidence batch has not yet
   * been fully persisted. It cannot be Review-ready even if a partial upload made
   * the visible EVA fields/images otherwise look complete. */
  sourceEvidencePending?: boolean;
  /** Manual source files reached a terminal archive failure and require staff retry. */
  sourceEvidenceArchiveFailed?: boolean;
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

/** Field keys still awaiting review or carrying an unresolved conflict. */
export function unresolvedReviewFieldKeys(
  fields: Record<EvaFieldKey, ReviewableField>,
): EvaFieldKey[] {
  return EVA_FIELD_ORDER.map((d) => d.key).filter((key) => {
    const state = fields[key]?.reviewState;
    return state === 'needs_review' || state === 'conflict';
  });
}

/** Stable groups used by every checklist adapter. */
export type ReadinessCheckGroup = 'fields' | 'images' | 'address' | 'conflicts' | 'source';

/** One canonical, handler-facing readiness check. */
export interface ReadinessCheck {
  id: string;
  label: string;
  ok: boolean;
  group: ReadinessCheckGroup;
  detail?: string;
}

/** The complete verdict consumed by status, the SPA checklist and submission. */
export interface CaseReadinessResult {
  checks: ReadinessCheck[];
  ready: boolean;
  requiredFieldsPresent: boolean;
  inspectionReady: boolean;
  /** Base accepted-count/role image contract (before unresolved-review gate). */
  imageRulesPass: boolean;
  imagesReady: boolean;
  reviewsResolved: boolean;
  sourceEvidenceReady: boolean;
}

const IMAGE_BASED_ASSESSMENT = 'Image Based Assessment';

/**
 * The ONE readiness evaluator.
 *
 * It is deliberately richer than a status enum: the same ordered checks drive
 * the Case Detail checklist while the booleans drive persisted status and the
 * submission guard. No caller is expected to re-implement any field, image,
 * address or review-state rule.
 */
export function evaluateCaseReadiness(
  input: Pick<
    StatusEvaluationInput,
    'evaFields' | 'evidence' | 'inspectionDecision' | 'sourceEvidencePending'
      | 'sourceEvidenceArchiveFailed'
  >,
): CaseReadinessResult {
  const checks: ReadinessCheck[] = [];

  for (const desc of EVA_FIELD_ORDER) {
    if (!desc.required || desc.key === 'inspectionAddress') continue;
    const ok = (input.evaFields[desc.key]?.value ?? '').trim().length > 0;
    checks.push({
      id: `field-${desc.key}`,
      label: `${desc.label} present`,
      ok,
      group: 'fields',
      ...(ok ? {} : { detail: `${desc.label} is empty` }),
    });
  }

  const imageReadiness = evaluateEvaImageReadiness(input.evidence);
  const imageRules = imageReadiness.rules;
  const imageGaps = imageReadiness.gaps.map((gap) => {
    switch (gap.code) {
      case 'min_count':
        return `need at least ${MIN_ACCEPTED_IMAGES} accepted (have ${imageRules.acceptedCount})`;
      case 'missing_overview':
        return 'no overview with a visible registration';
      case 'missing_damage_closeup':
        return 'no main-damage close-up';
      case 'review_required':
        return `${gap.count} image${gap.count === 1 ? '' : 's'} still ${gap.count === 1 ? 'needs' : 'need'} review`;
    }
  });
  const imagesReady = imageReadiness.ok;
  checks.push({
    id: 'images',
    label: 'Images',
    ok: imagesReady,
    group: 'images',
    ...(imagesReady ? {} : { detail: imageGaps.join('; ') }),
  });

  const address = (input.evaFields.inspectionAddress?.value ?? '').trim();
  const isImageBased = input.inspectionDecision === 'image_based';
  const hasDecision = input.inspectionDecision !== 'unknown';
  const addressMatchesDecision = isImageBased
    ? address === IMAGE_BASED_ASSESSMENT
    : address.length > 0 && address !== IMAGE_BASED_ASSESSMENT;
  const inspectionReady = hasDecision && addressMatchesDecision;
  let addressDetail: string | undefined;
  if (!address) addressDetail = 'Inspection address is empty';
  else if (!hasDecision) addressDetail = 'Choose an inspection address or Image Based Assessment';
  else if (!addressMatchesDecision) addressDetail = 'Inspection choice and address do not match';
  checks.push({
    id: 'address-decision',
    label: isImageBased ? 'Inspection: Image Based Assessment' : 'Inspection address ready',
    ok: inspectionReady,
    group: 'address',
    ...(inspectionReady ? {} : { detail: addressDetail ?? 'Choose an inspection option' }),
  });

  const unresolvedFields = unresolvedReviewFieldKeys(input.evaFields);
  const reviewsResolved = unresolvedFields.length === 0;
  checks.push({
    id: 'no-conflicts',
    label: 'No unresolved field reviews',
    ok: reviewsResolved,
    group: 'conflicts',
    ...(reviewsResolved
      ? {}
      : {
          detail: `Review: ${unresolvedFields
            .map((key) => EVA_FIELD_ORDER.find((d) => d.key === key)?.label ?? key)
            .join(', ')}`,
        }),
  });

  const sourceEvidenceReady = input.sourceEvidencePending !== true
    && input.sourceEvidenceArchiveFailed !== true;
  if (!sourceEvidenceReady) {
    checks.push({
      id: 'source-evidence',
      label: 'Source files added',
      ok: false,
      group: 'source',
      detail: input.sourceEvidenceArchiveFailed
        ? 'A selected source file could not be archived. Retry it from Evidence'
        : 'The selected instruction or extra files still need to be added',
    });
  }

  const requiredFieldsPresent = missingRequiredFieldKeys(input.evaFields).length === 0;
  return {
    checks,
    ready: checks.every((check) => check.ok),
    requiredFieldsPresent,
    inspectionReady,
    imageRulesPass: imageRules.ok,
    imagesReady,
    reviewsResolved,
    sourceEvidenceReady,
  };
}

/* ----------  Count of instruction-kind evidence (FIX-3 input)  ----------
   The image rules ignore non-image evidence; the status tree, however, needs to
   know whether ANY instructions arrived. `evidence` carries `kind` as a string,
   so instruction-kind rows are counted here when the caller doesn't pass an
   explicit `instructionCount`. */
function instructionCountOf(input: StatusEvaluationInput): number {
  if (typeof input.instructionCount === 'number') return input.instructionCount;
  return input.evidence.filter((e) => e.kind === 'instruction').length;
}

/** Conservative identity probe from the EVA fields present in this contract. */
function hasIdentityOf(input: StatusEvaluationInput): boolean {
  if (typeof input.hasIdentity === 'boolean') return input.hasIdentity;
  const wp = input.evaFields.workProvider?.value?.trim() ?? '';
  const cn = input.evaFields.claimantName?.value?.trim() ?? '';
  return wp.length > 0 || cn.length > 0;
}

/* ----------  The guard (re-implements `statusForReviewCase`)  ----------
   Mirrors the LIVE FIX-3 EVIDENCE-AWARE tree (CS Status Evaluate
   `Compute_next_status`, flows/definitions/status-evaluate.definition.json), so
   the Code App contract and the deployed flow stop diverging (re-saving a Case
   through the app no longer re-stamps a status the flow wouldn't). Order is
   load-bearing:
     1. terminal?                          -> return it unchanged (terminal-lock)
     1b. merge-retired (`mergedInto` set)?  -> 'linked_to_instruction' (retired-lock,
         TKT-141: a merged case is resolved work — any recompute PRESERVES the
         retired state, and CONVERGES a marker-bearing case that was wrongly
         un-retired back to it; the only writer of the marker is the merge path,
         which sets `linked_to_instruction` atomically, and there is no unmerge)
     2. canonical readiness passes          -> 'ready_for_eva'
     3. field/address contract valid and images fail -> 'missing_images'
     4. field/address contract fails and base image rules pass
                                             -> 'missing_required_fields'
        (RESERVED for cases that actually hold accepted image evidence but whose
         required fields are incomplete — the "Images only" queue)
     4b. unresolved field/image review       -> 'needs_review'
     5. no accepted images AND no instructions -> 'needs_review'
        (nothing usable has arrived yet — pending/new; NEVER a premature error,
         and NEVER 'missing_required_fields' for an evidence-less case)
     6. identifiable (provider/vrm/caseref/claimant) -> 'needs_review'
     7. otherwise (unidentifiable, image-less)        -> 'error'

   Readiness is evaluated exactly once by `evaluateCaseReadiness`: required
   values, an explicit and internally-consistent inspection decision, the image
   contract, unresolved image decisions and every field review/conflict. The SPA
   checklist and submission path consume this same result.

   It deliberately does NOT invent `duplicate_risk` / `linked_to_instruction`
   (set by the dedup flow) nor the submit terminals (`eva_submitted` /
   `box_synced`, set by finalization); those are handled upstream and protected
   by the terminal-lock. */
export function statusForReviewCase(input: StatusEvaluationInput): CaseStatus {
  if (isTerminalStatus(input.status)) return input.status;

  // TKT-141 retired-lock: a merge-retired case (duplicate_keys.mergedInto) is
  // resolved work. Preserve `linked_to_instruction` instead of recomputing from
  // fields/images — otherwise any touch (re-ingest, evidence event, PATCH)
  // silently un-retires it and the isRetiredMerged exclusion goes inert (the
  // 2026-07-10 live regression). Terminal statuses still win above (a stale
  // marker never rewrites `removed`/`done`); a plain `linked_to_instruction`
  // case WITHOUT the marker keeps recomputing as before.
  if ((input.mergedInto ?? '').trim().length > 0) return 'linked_to_instruction';

  const readiness = evaluateCaseReadiness(input);
  const baseImagesValid = readiness.imageRulesPass;
  const fieldContractValid =
    readiness.requiredFieldsPresent && readiness.inspectionReady;

  if (readiness.ready) return 'ready_for_eva';
  if (fieldContractValid && !baseImagesValid) {
    return 'missing_images';
  }
  // missing_required_fields is RESERVED for cases WITH real (accepted) image
  // evidence — i.e. imagesValid — that are missing required fields. An
  // evidence-less, field-incomplete case falls through to the pending branches.
  if (!fieldContractValid && baseImagesValid) return 'missing_required_fields';

  // A complete-looking case with any unresolved field conflict/review or
  // classifier image decision remains Not Ready (needs_review maps there).
  if (
    (fieldContractValid || baseImagesValid) &&
    (!readiness.reviewsResolved || (baseImagesValid && !readiness.imagesReady))
  ) {
    return 'needs_review';
  }

  const acceptedImages = acceptedEvaImages(input.evidence).length;
  const instructionCount = instructionCountOf(input);
  // Nothing usable has arrived yet (no accepted images AND no instructions):
  // pending/new -> needs_review, never a premature error or "Images only".
  if (acceptedImages === 0 && instructionCount === 0) return 'needs_review';

  // Something arrived (instructions and/or unusable images) but it isn't
  // EVA-ready: a partially-identified case waits for a human; a wholly
  // unidentifiable, image-less one is an exception.
  return hasIdentityOf(input) ? 'needs_review' : 'error';
}

/** Open review issues = any field still `needs_review`, or any field in `conflict`. */
export function hasOpenReviewIssues(
  fields: Record<EvaFieldKey, ReviewableField>,
): boolean {
  return unresolvedReviewFieldKeys(fields).length > 0;
}
