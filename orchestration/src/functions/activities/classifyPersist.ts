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
import type { InboundEnvelope } from './fetchMessage.js';

interface ClassifyPersistInput {
  caseId: string;
  inbound: InboundEnvelope;
}

df.app.activity('classifyPersist', {
  handler: async (input: ClassifyPersistInput, ctx): Promise<{ persisted: number }> => {
    const { caseId, inbound } = input;

    const rows = inbound.attachments.map((a) => ({
      ...describeEvidence(a.filename, a.contentType),
      blobPath: a.blobPath,
      size: a.size,
    }));

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
