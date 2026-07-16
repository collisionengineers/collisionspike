/** *
 * Durable activity: mark a newly created case as ingested (new_email → ingested)
 * once the intake pipeline has picked it up (TKT-027). statusEvaluate later
 * computes the final review state.
 *
 * Idempotent: the Data API only updates when status is still new_email.
 */

import * as df from 'durable-functions';
import { dataApi } from '../../adapters/data-api.js';

df.app.activity('setIngested', {
  handler: async (input: { caseId: string }, ctx): Promise<{ updated: boolean }> => {
    const result = await dataApi.setIngested(input.caseId);
    ctx.log(JSON.stringify({ evt: 'setIngested', caseId: input.caseId, updated: result.updated }));
    return result;
  },
});
