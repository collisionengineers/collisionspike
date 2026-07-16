/**
 * Service-only drain seam for the durable evidence-backfill publisher monitor.
 *
 * The API remains the owner of the Postgres generation outbox and Storage Queue
 * publication. The orchestration app merely wakes this idempotent drain through an
 * eternal Durable monitor, avoiding a plain API timer that cannot wake FC1 at zero scale.
 */

import { app } from '@azure/functions';
import { withServiceAuth } from '../inbound/internal/service-support.js';
import { drainEvidenceBackfillRequests } from '../assistant/evidence-backfill.js';

app.http('internalEvidenceBackfillRequestDrain', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/evidence-backfill-requests/drain',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const result = await drainEvidenceBackfillRequests(undefined, 50);
      ctx.log(JSON.stringify({ evt: 'evidenceBackfillRequestDrain', ...result }));
      return { status: 200, jsonBody: result };
    }),
});
