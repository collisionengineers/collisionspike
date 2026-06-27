/**
 * orchestration/src/functions/activities/enrich.ts  (activity 6)
 *
 * Durable activity: invoke the enrichment Python Function (DVSA + DVLA direct via Entra
 * client_credentials + X-API-Key) to fetch MOT mileage, Experian history, etc.
 * Gated by ENRICHMENT_ENABLED.
 *
 * Pattern: same as parse.ts — throw on non-ok response so Durable retry kicks in.
 *
 * App-settings required: ENRICH_FN_URL, ENRICH_FN_KEY.
 */

import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';

df.app.activity('enrich', {
  handler: async (input: { caseId: string }, ctx): Promise<unknown> => {
    if (!gates.enrichment()) {
      ctx.log('[enrich] skipped — ENRICHMENT_ENABLED=false');
      return { skipped: true };
    }

    const res = await fetch(`${process.env.ENRICH_FN_URL}/api/enrich`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-functions-key': process.env.ENRICH_FN_KEY!,
      },
      body: JSON.stringify({ caseId: input.caseId }),
    });

    if (!res.ok) {
      // 4xx = nothing to enrich for this case (e.g. no VRM resolved yet) or otherwise
      // non-retryable — skip gracefully so the case still lands rather than failing the
      // orchestration. 5xx / network = transient → throw so the Durable retry policy retries.
      if (res.status >= 400 && res.status < 500) {
        ctx.log(`[enrich] enrichment returned ${res.status} — nothing to enrich for case ${input.caseId}; skipping`);
        return { skipped: true, status: res.status };
      }
      throw new Error(`[enrich] enrichment Function responded ${res.status}`);
    }

    return res.json();
  },
});
