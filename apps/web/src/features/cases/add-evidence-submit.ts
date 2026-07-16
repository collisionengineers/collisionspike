import type { EvidenceUploadResult } from '../../data';
import { evidenceUploadIsComplete } from '../../shared/evidence/evidence-upload-result';

export const ADD_EVIDENCE_QUEUES = ['not-ready', 'review', 'held'] as const;

export interface EvidenceUploadAccess {
  uploadEvidence(
    caseId: string,
    files: File[],
    options: { source: 'add_evidence'; idempotencyKey: string },
  ): Promise<EvidenceUploadResult>;
}

/**
 * The one Add evidence submit seam. Navigation is downstream of a confirmed
 * identity for every selected file; a partial/refused request stays on the form.
 */
export async function uploadEvidenceThenOpen(
  access: EvidenceUploadAccess,
  caseId: string,
  files: File[],
  idempotencyKey: string,
  openCase: (path: string) => void,
): Promise<EvidenceUploadResult> {
  const result = await access.uploadEvidence(caseId, files, {
    source: 'add_evidence',
    idempotencyKey,
  });
  if (evidenceUploadIsComplete(result, files.length)) openCase(`/case/${caseId}`);
  return result;
}
