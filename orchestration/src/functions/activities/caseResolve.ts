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
  /** Parser-confirmed PDF VRM (from the parse activity, which now runs first). Preferred
   *  over the email-body sniff for BOTH dedup scoping and the persisted case VRM (#7). */
  parserVrm?: string;
  /** #100 — parser-confirmed provider reference (a PDF-only ref feeds the Case/PO-first dedup
   *  ladder when the email yielded none, and is persisted as case_ref fill-if-empty). */
  parserRef?: string;
  /** #107 — parser-extracted document mileage (+unit); persisted fill-if-empty (ADR-0006
   *  document-first), so the MOT-estimate suppression is not a silent data loss. */
  parserMileage?: string;
  parserMileageUnit?: string;
}

df.app.activity('caseResolve', {
  handler: async (
    input: CaseResolveInput,
    ctx,
  ): Promise<{ outcome: string; caseId: string; casePo?: string | null }> => {
    const { inbound, providerId, matchState } = input;
    // Best known VRM = parser PDF VRM (most reliable) over the email-body sniff; both filtered.
    const bestVrm = ((input.parserVrm || inbound.candidateVrm) ?? '').trim();

    try {
      // Dedup context — open same-provider cases + seen ids/hashes (caller-scoped, re-asserted in resolveCase).
      const context = await dataApi.dedupContext({
        workProviderId: providerId ?? '',
        vrm: bestVrm,
        messageId: inbound.messageId,
      });

      const decision = resolveCase({
        messageId: inbound.messageId,
        payloadHash: inbound.payloadHash,
        candidateVrm: bestVrm,
        // #100 — fall back to the parser-confirmed reference for dedup when the email
        // subject/body did not yield a Case/PO (a ref that lives only in the PDF).
        candidateRef: inbound.candidateRef || input.parserRef || '',
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
        parserVrm: input.parserVrm,
        parserRef: input.parserRef,
        parserMileage: input.parserMileage,
        parserMileageUnit: input.parserMileageUnit,
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
      // casePo is minted (non-null) only for a known-provider `created` case — the intake
      // orchestrator uses it to name the Box folder (new-client→Held has no PO → no folder).
      return { outcome: persisted.outcome, caseId: persisted.caseId, casePo: persisted.casePo ?? null };
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
