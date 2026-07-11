import { query, type TxQuery } from './db.js';

const NOTE_CONTENT = {
  failed: {
    name: 'Attachments to add',
    text: 'The linked email arrived with attachments (e.g. photos or a PDF) that are not yet on this case. Please add them by hand from the email.',
  },
  partial: {
    name: 'Attachments to add',
    text: 'Some attachments from the linked email could not be added. Please add the missing attachments from the email.',
  },
  completed: {
    name: 'Attachments added',
    text: 'The attachments from the linked email have now been added. No manual action is needed.',
  },
} as const;

export type EvidenceBackfillNoteKind = keyof typeof NOTE_CONTENT;

/**
 * Keep one source-keyed attachment-recovery note per inbound email and case.
 *
 * A failed/partial outcome inserts the actionable note or updates the existing one
 * when a later attempt changes the recovery outcome. A completed outcome converts an
 * existing actionable note into a resolved informational note, but does not create a
 * new note on the normal success path. Exact replays leave both content and timestamps
 * untouched.
 */
export async function writeEvidenceBackfillNote(input: {
  caseId: string;
  inboundEmailId: string;
  author?: string;
  kind: EvidenceBackfillNoteKind;
}, q: TxQuery = query): Promise<void> {
  const sourceKey = `evidence-backfill:${input.inboundEmailId}`;
  const content = NOTE_CONTENT[input.kind];
  const author = input.author ?? 'System';

  if (input.kind === 'completed') {
    await q(
      `UPDATE note
          SET name = $3,
              author = $4,
              text = $5,
              occurred_at = now(),
              updated_at = now()
        WHERE case_id = $1
          AND source_key = $2
          AND (name, author, text) IS DISTINCT FROM ($3, $4, $5)`,
      [input.caseId, sourceKey, content.name, author, content.text],
    );
    return;
  }

  await q(
    `INSERT INTO note (name, case_id, author, text, source_key, occurred_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (case_id, source_key) WHERE source_key IS NOT NULL DO UPDATE
       SET name = EXCLUDED.name,
           author = EXCLUDED.author,
           text = EXCLUDED.text,
           occurred_at = now(),
           updated_at = now()
     WHERE (note.name, note.author, note.text)
           IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.author, EXCLUDED.text)`,
    [content.name, input.caseId, author, content.text, sourceKey],
  );
}
