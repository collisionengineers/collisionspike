/**
 * orchestration/src/functions/activities/caseResolve.ts  (activity 2)
 *
 * Durable activity: apply the ADR-0010 reference-disambiguated dedup ladder and
 * resolve/create the Case via the Data API (plan 22 §B, plan 21 §Logic 2).
 *
 * The *decision* runs HERE in the shared `@cs/domain` `resolveCase` — the same code the
 * API imports — so the two INVIOLABLE rules (never auto-merge on VRM+time; never link
 * across providers) have one implementation. The *persist* goes to the Data API, which
 * maps a UNIQUE(sourcemessageid) collision to `already_ingested` (idempotent intake — the
 * at-least-once Durable replay never creates a second case).
 */

import * as df from 'durable-functions';
import { resolveCase } from '@cs/domain';
import { dataApi, ConflictError } from '../../lib/data-api.js';
import type { InboundEnvelope } from './fetchMessage.js';

interface CaseResolveInput {
  inbound: InboundEnvelope;
  providerId?: string;
  matchState?: string;
}

df.app.activity('caseResolve', {
  handler: async (
    input: CaseResolveInput,
    ctx,
  ): Promise<{ outcome: string; caseId: string }> => {
    const { inbound, providerId, matchState } = input;

    try {
      // Dedup context — open same-provider cases + seen ids/hashes (caller-scoped, re-asserted in resolveCase).
      const context = await dataApi.dedupContext({
        workProviderId: providerId ?? '',
        vrm: inbound.candidateVrm,
        messageId: inbound.messageId,
      });

      const decision = resolveCase({
        messageId: inbound.messageId,
        payloadHash: inbound.payloadHash,
        candidateVrm: inbound.candidateVrm,
        candidateRef: inbound.candidateRef,
        workProviderId: providerId ?? '',
        openProviderCases: context.openProviderCases,
        seenMessageIds: context.seenMessageIds,
        seenPayloadHashes: context.seenPayloadHashes,
      });

      // Rung 1 — exact repeat → drop (already ingested; orchestrator short-circuits).
      if (decision.resolution === 'drop') {
        ctx.log(JSON.stringify({ evt: 'caseResolve', resolution: 'drop', messageId: inbound.messageId }));
        return { outcome: 'already_ingested', caseId: decision.targetCaseId ?? '' };
      }

      const persisted = await dataApi.resolvePersist({
        inbound,
        providerId,
        matchState,
        decision: {
          resolution: decision.resolution,
          targetCaseId: decision.targetCaseId,
          setDuplicateRisk: decision.setDuplicateRisk,
          caseLinkState: decision.caseLinkState,
          statusEffect: String(decision.statusEffect),
          auditAction: decision.auditAction,
        },
      });

      ctx.log(JSON.stringify({ evt: 'caseResolve', resolution: decision.resolution, outcome: persisted.outcome, caseId: persisted.caseId }));
      return { outcome: persisted.outcome, caseId: persisted.caseId };
    } catch (e) {
      if (e instanceof ConflictError) {
        // UNIQUE(sourcemessageid) backstop fired — a concurrent/replayed ingest already landed it.
        ctx.log(JSON.stringify({ evt: 'caseResolve', outcome: 'already_ingested', messageId: inbound.messageId }));
        return { outcome: 'already_ingested', caseId: '' };
      }
      throw e;
    }
  },
});
