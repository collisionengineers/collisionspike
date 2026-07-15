import type { Evidence } from '../../data';
import type { EvidenceReviewInput } from '../../data/rest-client';

export const EVIDENCE_SAVE_ERROR = 'Couldn’t save this photo. Try again.';
export const GUIDED_CAPTURE_REVIEW_WARNING = 'Review this submitted photo before using it for EVA.';
export const GUIDED_CAPTURE_EXCLUDED_WARNING =
  'This photo was excluded. Review it again before including it for EVA.';

export function guidedCaptureReviewWarning(
  evidence: Pick<Evidence, 'sourceLabel' | 'excluded' | 'excludedByStaff'>,
): string | undefined {
  if (evidence.sourceLabel !== 'public_guided_capture' || !evidence.excluded) return undefined;
  return evidence.excludedByStaff
    ? GUIDED_CAPTURE_EXCLUDED_WARNING
    : GUIDED_CAPTURE_REVIEW_WARNING;
}

/** One synchronous per-evidence lock shared by every mutation affordance. */
export function tryAcquireEvidenceMutation(active: Set<string>, evidenceId: string): boolean {
  if (active.has(evidenceId)) return false;
  active.add(evidenceId);
  return true;
}

export function releaseEvidenceMutation(active: Set<string>, evidenceId: string): void {
  active.delete(evidenceId);
}

/** The PATCH response is the authoritative, transactionally refreshed Evidence row. */
export function mergeEvidenceReviewDecision(_current: Evidence, updated: Evidence): Evidence {
  return updated;
}

/** Resolve one durable review request without manufacturing an optimistic row. */
export async function persistEvidenceReview(
  evidenceId: string,
  input: EvidenceReviewInput,
  save: (id: string, update: EvidenceReviewInput) => Promise<Evidence>,
): Promise<{ updated?: Evidence; error?: string }> {
  try {
    return { updated: await save(evidenceId, input) };
  } catch {
    return { error: EVIDENCE_SAVE_ERROR };
  }
}
