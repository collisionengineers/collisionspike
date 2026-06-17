import type { Evidence } from './types';
import { cases } from './cases';

/** Flat list of all evidence across cases (handy for galleries / counts). */
export const allEvidence: Evidence[] = cases.flatMap((c) => c.evidence);

/** Evidence for a given case. */
export function evidenceForCase(caseId: string): Evidence[] {
  return cases.find((c) => c.id === caseId)?.evidence ?? [];
}

/** Only the image-kind, non-excluded evidence for a case (EVA-relevant set). */
export function imagesForCase(caseId: string): Evidence[] {
  return evidenceForCase(caseId).filter((e) => e.kind === 'image' && !e.excluded);
}
