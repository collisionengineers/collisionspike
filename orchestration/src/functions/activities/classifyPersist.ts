/**
 * orchestration/src/functions/activities/classifyPersist.ts  (activity 3)
 *
 * Durable activity: classify email attachments (instruction / image / email / other) and
 * persist evidence rows for the Case via the Data API (plan 22 §B).
 *
 * D10 — classification uses the shared `@cs/domain` `describeEvidence` (the SAME rule the
 * intake flow mirrors). Idempotent: the Data API upserts by blob path, so a re-run after a
 * partial persist updates existing rows rather than duplicating (at-least-once activities).
 */

import * as df from 'durable-functions';
import { describeEvidence } from '@cs/domain';
import { dataApi } from '../../lib/data-api.js';
import { uploadEvidenceBytes } from '../../lib/blob.js';
import type { InboundEnvelope } from './fetchMessage.js';

interface ClassifyPersistInput {
  caseId: string;
  inbound: InboundEnvelope;
}

/** Minimum body length to treat as a genuine in-body instruction (skip one-liners/footers). */
const MIN_BODY_INSTRUCTION_CHARS = 40;

df.app.activity('classifyPersist', {
  handler: async (input: ClassifyPersistInput, ctx): Promise<{ persisted: number }> => {
    const { caseId, inbound } = input;

    const rows = inbound.attachments.map((a) => ({
      ...describeEvidence(a.filename, a.contentType),
      blobPath: a.blobPath,
      size: a.size,
    }));

    // The original message captured as raw `.eml` (box-sync ticket) becomes its own
    // email-class evidence row so the archive holds the email itself. Idempotent on
    // its deterministic blob path ({messageId}/message.eml). Omitted when the
    // `$value` capture failed in fetchMessage (best-effort).
    if (inbound.rawEml) {
      rows.push({
        ...describeEvidence(inbound.rawEml.filename, inbound.rawEml.contentType),
        blobPath: inbound.rawEml.blobPath,
        size: inbound.rawEml.size,
      });
    }

    // Body-only instruction (ADR-0015): a RECEIVING-WORK email whose instructions are typed
    // in the body with NO instruction attachment must still yield instruction evidence, else
    // the case lands empty. Persist the body text to Blob and add one instruction row.
    const hasInstructionAttachment = rows.some((r) => r.evidenceClass === 'instruction');
    const bodyText = (inbound.body ?? '').trim();
    if (!hasInstructionAttachment && bodyText.length >= MIN_BODY_INSTRUCTION_CHARS) {
      const up = await uploadEvidenceBytes(
        inbound.messageId,
        'email-body.txt',
        Buffer.from(bodyText, 'utf8'),
        'text/plain',
      );
      rows.push({
        filename: 'email-body.txt',
        contentType: 'text/plain',
        extension: 'txt',
        evidenceClass: 'instruction',
        isImage: false,
        isInstruction: true,
        blobPath: up.blobPath,
        size: up.size,
      });
      ctx.log(JSON.stringify({ evt: 'classifyPersist.bodyInstruction', caseId, bytes: up.size }));
    }

    const result = await dataApi.persistEvidence(caseId, rows);

    // attachment_classified (auditaction 2) — one branch per persist, matching the flow.
    await dataApi.recordAudit({
      action: 'attachment_classified',
      caseId,
      summary: `classified + persisted ${result.persisted} evidence row(s)`,
    });

    ctx.log(JSON.stringify({ evt: 'classifyPersist', caseId, persisted: result.persisted }));
    return result;
  },
});
