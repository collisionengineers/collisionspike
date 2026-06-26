/**
 * orchestration/src/functions/activities/parse.ts  (activity 4)
 *
 * Durable activity: invoke the Python parser Function (cedocumentmapper engine) to
 * extract structured fields from instruction PDFs. Gated by PDF_MAPPER_ENABLED.
 *
 * Pattern shared by all "call an existing Python Function" activities (plan 22 §B).
 * Throwing an Error causes the Durable retry policy to kick in.
 *
 * App-settings required: PARSER_FN_URL, PARSER_FN_KEY.
 */

import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';

df.app.activity('parse', {
  handler: async (input: { caseId: string }, ctx): Promise<unknown> => {
    if (!gates.pdfMapper()) {
      ctx.log('[parse] skipped — PDF_MAPPER_ENABLED=false');
      return { skipped: true };
    }

    const res = await fetch(`${process.env.PARSER_FN_URL}/api/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-functions-key': process.env.PARSER_FN_KEY!,
      },
      body: JSON.stringify({ caseId: input.caseId }),
    });

    if (!res.ok) {
      // Throw so the Durable retry policy retries this activity.
      throw new Error(`[parse] parser Function responded ${res.status}`);
    }

    return res.json();
  },
});
