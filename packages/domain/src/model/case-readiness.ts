import {
  evaluateCaseReadiness,
  type CaseReadinessResult,
  type StatusEvaluationInput,
} from '../contracts/case-status';
import type { Case } from './types';
import { caseToQueue } from './queues';

export type SourceReadinessInput = Pick<
  StatusEvaluationInput,
  'sourceEvidencePending' | 'sourceEvidenceArchiveFailed'
>;

/** Preserve server-owned Manual Intake source state when a case snapshot is
 * copied into an edit session or another readiness adapter. */
export function sourceReadinessInputForCase(
  c: Pick<Case, 'sourceEvidencePending' | 'sourceEvidenceArchiveFailed'>,
): Required<SourceReadinessInput> {
  return {
    sourceEvidencePending: c.sourceEvidencePending === true,
    sourceEvidenceArchiveFailed: c.sourceEvidenceArchiveFailed === true,
  };
}

/** Refresh only server-owned source readiness on a local case draft. This is safe
 * while unrelated editable fields are dirty because it cannot replace them. */
export function mergeSourceReadinessIntoCase<T extends Case>(
  draft: T,
  server: Pick<Case, 'status' | 'sourceEvidencePending' | 'sourceEvidenceArchiveFailed'>,
): T {
  return { ...draft, status: server.status, ...sourceReadinessInputForCase(server) };
}

/**
 * Adapt the shared Case model to the canonical readiness/status input.
 *
 * API recomputation, staff submission and the SPA checklist all call this
 * adapter so identity, inspection and evidence semantics cannot drift between
 * surfaces.
 */
export function readinessInputForCase(c: Case): StatusEvaluationInput {
  return {
    status: c.status,
    evaFields: c.evaFields,
    evidence: c.evidence,
    inspectionDecision: c.inspectionDecision,
    instructionCount: c.evidence.filter((e) => e.kind === 'instruction').length,
    ...sourceReadinessInputForCase(c),
    hasIdentity:
      c.vrm.trim().length > 0 ||
      (c.casePo ?? '').trim().length > 0 ||
      c.providerCode.trim().length > 0 ||
      c.evaFields.claimantName.value.trim().length > 0,
    mergedInto: c.mergedInto,
  };
}

/** Canonical readiness for a fully-loaded Case. */
export function readinessForCase(c: Case): CaseReadinessResult {
  return evaluateCaseReadiness(readinessInputForCase(c));
}

/**
 * Submission eligibility adds workflow precedence to canonical readiness. A
 * case must currently evaluate ready AND belong to Review; an explicit hold,
 * duplicate/merge branch or terminal state therefore cannot be submitted.
 */
export function canSubmitCaseToEva(c: Case): boolean {
  const input = readinessInputForCase(c);
  const readiness = evaluateCaseReadiness(input);
  return readiness.ready && caseToQueue({
    status: c.status,
    onHold: c.onHold,
    mergedInto: c.mergedInto,
  }) === 'review';
}
