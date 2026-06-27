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
      // 4xx = nothing to parse for this case (e.g. an instruction-only / no-PDF email)
      // or an otherwise non-retryable request — skip gracefully so the case still lands
      // (a partial case held for review per the domain model) instead of failing the whole
      // orchestration. 5xx / network = transient → throw so the Durable retry policy retries.
      if (res.status >= 400 && res.status < 500) {
        ctx.log(`[parse] parser returned ${res.status} — no parseable document for case ${input.caseId}; skipping`);
        return { skipped: true, status: res.status };
      }
      throw new Error(`[parse] parser Function responded ${res.status}`);
    }

    return res.json();
  },
});
