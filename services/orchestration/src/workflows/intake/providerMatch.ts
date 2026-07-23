/**
 *
 * Durable activity: resolve the sender's identity — a direct work-provider, an
 * Image-Source INTERMEDIARY (rules-engine-v2 Phase 3, ADR-0011 — e.g. Connexus routing
 * for PCH/SBL), or neither.
 *
 * D10 — the matching RULE runs here in the shared `@cs/domain` `matchSenderIdentity`
 * (the SAME code the API + SPA use for the direct-provider arm — `matchProviderByDomain`
 * itself is UNCHANGED; `matchSenderIdentity` is a new function built on top of it); the
 * Data API only supplies the corpus rows (now both providers AND Image-Source
 * intermediaries). Ambiguity NEVER auto-picks (returns 'ambiguous' with the colliding
 * ids — plan 22 mirrors the inlined `Filter_exact_domain` → `Switch_match_count` of the
 * intake flow).
 *
 * CLASSIFIER/TRIAGE CONTRACT: an 'intermediary' outcome maps
 * `matchState` to 'unmatched' — EXACTLY what a plain domain match already produced for
 * an intermediary's domain today (it has never been a work_provider's own domain), so
 * classifyInbound / triagePolicy's provider_match_state signal is byte-identical to
 * before this change. Only the NEW `imageSourceId`/`imageSourceName`/
 * `candidateProviderIds` fields carry the richer signal, threaded by the orchestrator
 * into triagePolicy's decisionInputs (telemetry) and caseResolve's resolve-persist
 * payload (so the API's applyParserFields can treat a content-detected provider among
 * the candidates as corroborated — see
 * services/data-api/src/features/inbound/internal/parser-fields.ts).
 *
 * Idempotent read — safe to retry.
 */

import * as df from 'durable-functions';
import { matchSenderIdentity } from '@cs/domain';
import { dataApi } from '../../adapters/data-api.js';
import { identifyingSenderFor } from '../intake-v2/intakeEngineDecision.js';
import type { InboundEnvelope } from './fetchMessage.js';

export interface ProviderMatchActivityResult {
  outcome: 'matched' | 'unmatched' | 'ambiguous' | 'intermediary';
  workProviderId?: string;
  principalCode?: string;
  matchedDomain: string;
  /** CLASSIFIER/TRIAGE-FACING state — stays the pre-Phase-3 3-value vocabulary on
   *  purpose (see the module doc): an 'intermediary' outcome maps to 'unmatched' here. */
  matchState: 'matched' | 'unmatched' | 'ambiguous';
  ambiguousProviderIds?: string[];
  /** Phase 3 / ADR-0011 — set only when outcome === 'intermediary': the Image-Source row
   *  the sender's domain matched + its N:N candidate work providers. */
  imageSourceId?: string;
  imageSourceName?: string;
  candidateProviderIds?: string[];
}

df.app.activity('providerMatch', {
  handler: async (inbound: InboundEnvelope, ctx): Promise<ProviderMatchActivityResult> => {
    const { providers, imageSources } = await dataApi.providerMatchRecords();
    // @cs/intake-engine (INTAKE_ENGINE_ENABLED): a staff forward's envelope `From` is a
    // Collision Engineers address and correctly matches nothing — the originating provider
    // address lives in the quoted forward header. Recover it so a forwarded instruction
    // resolves to its real provider. Gate off => the envelope sender, byte-identical.
    const identifying = identifyingSenderFor(inbound.senderAddress, inbound.body);
    const identity = matchSenderIdentity(identifying.senderAddress, providers, imageSources);
    if (identifying.source === 'forwarded_header') {
      ctx.log(JSON.stringify({ evt: 'providerMatch', senderSource: 'forwarded_header' }));
    }

    if (identity.kind === 'intermediary') {
      await dataApi.recordAudit({
        action: 'provider_matched',
        summary: `provider-match intermediary (${identity.name}) for ${identity.matchedDomain}`,
        severity: 'info',
      });
      ctx.log(
        JSON.stringify({
          evt: 'providerMatch',
          outcome: 'intermediary',
          domain: identity.matchedDomain,
          imageSourceId: identity.imageSourceId,
          candidateCount: identity.candidateProviderIds.length,
        }),
      );
      return {
        outcome: 'intermediary',
        matchedDomain: identity.matchedDomain,
        matchState: 'unmatched',
        imageSourceId: identity.imageSourceId,
        imageSourceName: identity.name,
        candidateProviderIds: [...identity.candidateProviderIds],
      };
    }

    const result =
      identity.kind === 'provider'
        ? identity.result
        : { outcome: 'unmatched' as const, matchedDomain: identity.matchedDomain };

    // Audit the match outcome (provider_matched 7 / provider_unmatched 8) — byte-identical
    // to pre-Phase-3 behaviour for both the 'provider' and 'none' cases.
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
