/** backfill-result — reusable feature support. */



export type EvidenceBackfillCommittedOutcome = 'completed' | 'partial';

export interface EvidenceBackfillCommittedResult {
  outcome: EvidenceBackfillCommittedOutcome;
  persisted: number;
  merged?: number;
  failedAttachments?: number;
  detail?: string;
}

export function parseEvidenceBackfillCommittedResult(value: unknown): EvidenceBackfillCommittedResult | null {
  let candidate = value;
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const row = candidate as Record<string, unknown>;
  if (row.outcome !== 'completed' && row.outcome !== 'partial') return null;
  const persisted = Number(row.persisted);
  if (!Number.isSafeInteger(persisted) || persisted < 0) return null;
  const result: EvidenceBackfillCommittedResult = { outcome: row.outcome, persisted };
  const merged = Number(row.merged);
  if (Number.isSafeInteger(merged) && merged >= 0) result.merged = merged;
  const failedAttachments = Number(row.failedAttachments);
  if (Number.isSafeInteger(failedAttachments) && failedAttachments >= 0) {
    result.failedAttachments = failedAttachments;
  }
  if (typeof row.detail === 'string' && row.detail.trim()) result.detail = row.detail.slice(0, 300);
  return result;
}
