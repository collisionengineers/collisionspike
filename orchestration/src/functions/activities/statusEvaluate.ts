/**
 * orchestration/src/functions/activities/statusEvaluate.ts  (activity 5)
 *
 * Durable activity: re-evaluate EVA readiness + the status state machine for the Case and
 * persist the computed status (plan 22 §B; plan 21 §Logic 1 + 4).
 *
 * The Data API owns the write-side status machine — it runs the SHARED `statusForReviewCase`
 * + `validateEvaImageRules` over the persisted rows (terminal-lock enforced; status integer
 * preserved) and writes the `status_changed` audit row. The orchestration triggers the
 * recompute through an internal route rather than recomputing over a stale in-memory copy,
 * so readiness stays "derived, never stored as a separate truth".
 *
 * Idempotent: recompute over the same persisted rows yields the same status.
 */

import * as df from 'durable-functions';
import { dataApi } from '../../lib/data-api.js';

df.app.activity('statusEvaluate', {
  handler: async (input: { caseId: string }, ctx): Promise<{ value: string }> => {
    const result = await dataApi.evaluateStatus(input.caseId);
    ctx.log(JSON.stringify({ evt: 'statusEvaluate', caseId: input.caseId, status: result.value }));
    return result;
  },
});
