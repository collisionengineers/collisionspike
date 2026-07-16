/* TEST FIXTURES — derived from the fabricated cases. NOT shipped (tree-shaken
   out of dist). See __fixtures__/cases.ts. */
import type { Evidence } from '@cs/domain';
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
