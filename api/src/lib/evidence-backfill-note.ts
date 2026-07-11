import { query, type TxQuery } from './db.js';

const NOTE_NAME = 'Attachments to add';

const NOTE_TEXT = {
  failed:
    'The linked email arrived with attachments (e.g. photos or a PDF) that are not yet on this case. Please add them by hand from the email.',
  partial:
    'Some attachments from the linked email could not be added. Please add the missing attachments from the email.',
} as const;

export type EvidenceBackfillNoteKind = keyof typeof NOTE_TEXT;

/**
 * Write at most one attachment-recovery note for an inbound email on a case.
 * Two different emails on the same case remain distinct; a queue replay is a no-op.
 */
export async function writeEvidenceBackfillNote(input: {
  caseId: string;
  inboundEmailId: string;
  author?: string;
  kind: EvidenceBackfillNoteKind;
}, q: TxQuery = query): Promise<void> {
  const sourceKey = `evidence-backfill:${input.inboundEmailId}`;
  await q(
    `INSERT INTO note (name, case_id, author, text, source_key, occurred_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (case_id, source_key) WHERE source_key IS NOT NULL DO NOTHING`,
    [NOTE_NAME, input.caseId, input.author ?? 'System', NOTE_TEXT[input.kind], sourceKey],
  );
}
