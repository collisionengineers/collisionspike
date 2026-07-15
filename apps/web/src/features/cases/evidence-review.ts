import type { Evidence } from '../../data';
import type { EvidenceReviewInput } from '../../data/rest-client';

export const EVIDENCE_SAVE_ERROR = 'Couldn’t save this photo. Try again.';

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
