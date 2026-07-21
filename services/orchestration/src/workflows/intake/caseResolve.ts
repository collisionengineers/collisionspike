/** *
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
import { dataApi, ConflictError, type ParserEvaFields } from '../../adapters/data-api.js';
import type { InboundEnvelope } from './fetchMessage.js';
import { resolveCaseVrm } from './case-identity.js';

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
  /** Parser-owned EVA fields (claimant, dates, vehicle, circumstances, VAT) extracted from the
   *  instruction document — forwarded to resolve-persist for fill-if-empty so an email-minted
   *  case carries the full extraction, not just its registration + Case/PO. */
  parserEvaFields?: ParserEvaFields;
  /** rules-engine-v2 Phase 3 (ADR-0011) — set when the providerMatch activity resolved the
   *  sender to an Image-Source intermediary (e.g. Connexus) rather than a direct provider.
   *  Forwarded to resolve-persist so the API's applyParserFields can treat a content-detected
   *  provider found among the intermediary's N:N candidates as CORROBORATED. */
  intermediaryImageSourceId?: string;
  intermediaryCandidateProviderIds?: string[];
  /** ADR-0021 — the intake case-type decision (orchestrator decideCaseType). The API applies
   *  it (case_type_code + marker mint) only behind AUDIT_CASES_ENABLED; otherwise it records
   *  an observe-only audit_event (shadow rollout). */
  caseType?: 'standard' | 'audit' | 'audit_total_loss' | 'diminution';
  caseTypeDual?: boolean;
  caseTypeSignals?: string[];
}

df.app.activity('caseResolve', {
  handler: async (
    input: CaseResolveInput,
    ctx,
  ): Promise<{
    outcome: string;
    caseId: string;
    casePo?: string | null;
    /** Matched provider's automation mode — drives the orchestrator's intake branch (am ticket). */
    providerAutomationMode?: 'manual' | 'review_auto' | 'full_auto';
    providerRecovery?: 'identity_ready' | 'not_needed' | 'blocked';
  }> => {
    const { inbound, providerId, matchState } = input;
    // Best known VRM = parser PDF VRM (most reliable) over the email-body sniff; both filtered.
    // (case-identity.ts's resolveCaseVrm — PLAN-014 Slice 0; equivalent to the prior inline form.)
    const bestVrm = resolveCaseVrm({ parserVrm: input.parserVrm, candidateVrm: inbound.candidateVrm });
    const sourceMessageId = inbound.internetMessageId || inbound.messageId;

    try {
      // Dedup context — open same-provider cases + seen ids/hashes (caller-scoped, re-asserted in resolveCase).
      const context = await dataApi.dedupContext({
        workProviderId: providerId ?? '',
        vrm: bestVrm,
        messageId: sourceMessageId,
      });

      const replayExactOwner = async (targetCaseId: string) => {
        const replayed = await dataApi.resolvePersist({
          inbound,
          providerId,
          matchState,
          parserVrm: input.parserVrm,
          parserRef: input.parserRef,
          parserMileage: input.parserMileage,
          parserMileageUnit: input.parserMileageUnit,
          parserEva: input.parserEvaFields,
          intermediaryImageSourceId: input.intermediaryImageSourceId,
          intermediaryCandidateProviderIds: input.intermediaryCandidateProviderIds,
          caseType: input.caseType,
          caseTypeDual: input.caseTypeDual,
          caseTypeSignals: input.caseTypeSignals,
          decision: {
            resolution: 'replay',
            targetCaseId,
            setDuplicateRisk: false,
            caseLinkState: 'none',
            statusEffect: 'ingested',
            auditAction: 'case_attached',
          },
        });
        return {
          outcome: 'replayed',
          caseId: replayed.caseId,
          casePo: replayed.casePo ?? null,
          providerAutomationMode: replayed.providerAutomationMode,
          providerRecovery: replayed.providerRecovery,
        };
      };

      // Resolve immutable ownership before the provider-scoped ladder. This also repairs
      // redeliveries of a previously Held case whose provider was still NULL, which the
      // provider-scoped seen-id query cannot contain.
      if (context.exactSourceOwner) {
        ctx.log(JSON.stringify({
          evt: 'caseResolve',
          resolution: 'exact_source_replay',
          messageId: sourceMessageId,
          caseId: context.exactSourceOwner.caseId,
        }));
        if (context.exactSourceOwner.replayAllowed) {
          return replayExactOwner(context.exactSourceOwner.caseId);
        }
        return {
          outcome: 'already_ingested',
          caseId: context.exactSourceOwner.caseId,
          casePo: context.exactSourceOwner.casePo,
          providerAutomationMode: context.exactSourceOwner.providerAutomationMode,
        };
      }

      const decision = resolveCase({
        // TKT-092: the rung-1 repeat key MUST be the INTERNET Message-Id —
        // `seenMessageIds` comes from case_.source_message_id, which stores the
        // Internet-Message-Id; the Graph `messageId` differs per mailbox/delivery, so
        // passing it here meant the message-id rung could never match a redelivery.
        messageId: sourceMessageId,
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

      // Rung 1 — exact repeat. Re-apply the retained parser result to the exact
      // source-message owner before resuming the idempotent downstream stages. A prior
      // attempt can commit the case and fail before parser fields, evidence, Archive, or
      // readiness are complete; returning early would strand that partial case forever.
      if (decision.resolution === 'drop') {
        ctx.log(JSON.stringify({ evt: 'caseResolve', resolution: 'drop', messageId: inbound.messageId }));
        if (context.seenMessageIds.includes(sourceMessageId)) {
          throw new Error(
            `Exact-repeat decision for ${sourceMessageId} has no immutable source-message owner`,
          );
        }
        // A byte-identical payload delivered under a different Message-ID is the other
        // ADR-0010 rung-1 case. It has no source-message owner by definition and remains
        // an idempotent payload-duplicate drop.
        return { outcome: 'already_ingested', caseId: '' };
      }

      const persisted = await dataApi.resolvePersist({
        inbound,
        providerId,
        matchState,
        parserVrm: input.parserVrm,
        parserRef: input.parserRef,
        parserMileage: input.parserMileage,
        parserMileageUnit: input.parserMileageUnit,
        parserEva: input.parserEvaFields,
        intermediaryImageSourceId: input.intermediaryImageSourceId,
        intermediaryCandidateProviderIds: input.intermediaryCandidateProviderIds,
        caseType: input.caseType,
        caseTypeDual: input.caseTypeDual,
        caseTypeSignals: input.caseTypeSignals,
        decision: {
          resolution: decision.resolution,
          targetCaseId: decision.targetCaseId,
          setDuplicateRisk: decision.setDuplicateRisk,
          caseLinkState: decision.caseLinkState,
          statusEffect: String(decision.statusEffect),
          auditAction: decision.auditAction,
        },
      });

      ctx.log(JSON.stringify({ evt: 'caseResolve', resolution: decision.resolution, outcome: persisted.outcome, caseId: persisted.caseId, mode: persisted.providerAutomationMode }));
      // casePo is minted (non-null) only for a known-provider `created` case — the intake
      // orchestrator uses it to name the Box folder (new-client→Held has no PO → no folder).
      // providerAutomationMode comes from the resolve SEAM; the orchestrator branches on it.
      return {
        outcome: persisted.outcome,
        caseId: persisted.caseId,
        casePo: persisted.casePo ?? null,
        providerAutomationMode: persisted.providerAutomationMode,
        providerRecovery: persisted.providerRecovery,
      };
    } catch (e) {
      if (e instanceof ConflictError) {
        // The API resolves an exact source-message owner as a normal 200 response. A
        // remaining 409 has no exact owner and must retry/fail visibly; never turn it into
        // an ownerless "already ingested" result that silently skips downstream work.
        ctx.log(JSON.stringify({ evt: 'caseResolve', outcome: 'conflict_retry', messageId: inbound.messageId }));
      }
      throw e;
    }
  },
});
