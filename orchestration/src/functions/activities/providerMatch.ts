/**
 * orchestration/src/functions/activities/providerMatch.ts  (activity 1)
 *
 * Durable activity: match the sender email domain to a work-provider.
 *
 * D10 — the matching RULE runs here in the shared `@cs/domain` `matchProviderByDomain`
 * (the SAME code the API + SPA use); the Data API only supplies the corpus rows. Ambiguity
 * NEVER auto-picks (returns 'ambiguous' with the colliding ids — plan 22 mirrors the inlined
 * `Filter_exact_domain` → `Switch_match_count` of the intake flow).
 *
 * Idempotent read — safe to retry.
 */

import * as df from 'durable-functions';
import { matchProviderByDomain } from '@cs/domain';
import { dataApi } from '../../lib/data-api.js';
import type { InboundEnvelope } from './fetchMessage.js';

export interface ProviderMatchActivityResult {
  outcome: 'matched' | 'unmatched' | 'ambiguous';
  workProviderId?: string;
  principalCode?: string;
  matchedDomain: string;
  matchState: 'matched' | 'unmatched' | 'ambiguous';
  ambiguousProviderIds?: string[];
}

df.app.activity('providerMatch', {
  handler: async (inbound: InboundEnvelope, ctx): Promise<ProviderMatchActivityResult> => {
    const records = await dataApi.providerMatchRecords();
    const result = matchProviderByDomain(inbound.senderAddress, records);

    // Audit the match outcome (provider_matched 7 / provider_unmatched 8).
    await dataApi.recordAudit({
      action: result.outcome === 'matched' ? 'provider_matched' : 'provider_unmatched',
      summary: `provider-match ${result.outcome} for ${result.matchedDomain || '<no domain>'}`,
      severity: result.outcome === 'matched' ? 'info' : 'warning',
    });

    ctx.log(JSON.stringify({ evt: 'providerMatch', outcome: result.outcome, domain: result.matchedDomain }));
    return {
      outcome: result.outcome,
      workProviderId: result.workProviderId,
      principalCode: result.principalCode,
      matchedDomain: result.matchedDomain,
      matchState: result.outcome,
      ambiguousProviderIds: result.ambiguousProviderIds,
    };
  },
});
