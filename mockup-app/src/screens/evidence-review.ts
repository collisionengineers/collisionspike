import type { Evidence } from '../data';
import type { EvidenceReviewInput } from '../data/rest-client';

export const EVIDENCE_SAVE_ERROR = 'Couldn’t save this photo. Try again.';

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
