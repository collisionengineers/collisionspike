/**
 * orchestration/src/functions/activities/triagePolicy.ts  (activity 1.55)
 *
 * Durable activity: Stage B of the triage pipeline (ADR-0019 / rules-engine-v2 Phase 2).
 * Resolves the LIVE context the pure `@cs/domain` `decideTriage` needs — open-case
 * Case/PO + job-ref + VRM matches, cross-mailbox duplicate delivery, local
 * conversation-thread siblings — via one Data API read (`POST
 * /api/internal/triage/context`), then turns (Stage-A's classification x that context)
 * into ONE triage action.
 *
 * Runs the decision TWICE per arrival:
 *   - `shadow` — ALL FOUR TRIAGE_* gates forced ON: the would-be decision, telemetry
 *     ONLY. NEVER writes a suggestion, whatever it decides (ADR-0019 §5 / the Phase-2
 *     plan's "no shadow rows in ai_suggestion while its gate is off").
 *   - `acting` — the REAL gates, read fresh from `@cs/domain/gates` on every call (an
 *     activity is exactly where an env read belongs — `decideTriage` itself never reads
 *     `process.env`). This is the decision the orchestrator actually routes on, and the
 *     ONLY one that (when it proposes something) writes an `ai_suggestion` row.
 * ONE always-on App Insights customEvent ('triage_decision') is emitted per arrival
 * regardless of gate state — the "every policy decision logs always-on" observation
 * channel the suggest-first promotion ladder (ADR-0019 §4) reads from.
 *
 * KILL-SWITCH INVARIANT (inherited from the domain module): with every TRIAGE_*_ENABLED
 * gate absent, `acting` is ALWAYS 'proceed_default' — this activity therefore adds only
 * the context lookup + the telemetry event to today's behaviour; the orchestrator's
 * routing on the returned decision changes nothing else (see intakeOrchestrator.ts §1.55).
 *
 * RELIABILITY (the "additive feature never blocks intake" convention this app already
 * applies to extractImages/boxArchive/enrich): a failed context lookup degrades to an
 * EMPTY context (no matches, not a duplicate, no siblings) rather than failing the
 * activity — a currently-gated, best-effort FEATURE must never become a NEW way for core
 * intake to break, even before any TRIAGE_* gate is flipped on. The suggestion write is
 * independently best-effort per-call (see step (e) below / the module's own try/catch).
 *
 * Idempotent / replay-safe: the context read is a pure lookup (no mutation, safe to
 * re-issue on an at-least-once replay); the suggestion write
 * (`/api/internal/triage/suggest-link`) is idempotent server-side (an equivalent PENDING
 * suggestion already existing -> `created: false`, never a duplicate row); the telemetry
 * POST is fire-and-forget (see lib/telemetry.ts) — a customEvents miss on retry is an
 * acceptable loss, never a reason to fail the activity or the orchestration.
 */

import * as df from 'durable-functions';
import {
  decideTriage,
  type TriagePolicyClassification,
  type TriagePolicyContext,
  type TriagePolicyDecision,
  type TriagePolicyGates,
} from '@cs/domain';
import { gates } from '@cs/domain/gates';
import { dataApi, type TriageContextRequest, type TriageContextResult } from '../../lib/data-api.js';
import { trackEvent } from '../../lib/telemetry.js';
import { attachmentKindsOf, type InboundClassification } from './classifyInbound.js';
import type { InboundEnvelope } from './fetchMessage.js';

interface TriagePolicyInput {
  inbound: InboundEnvelope;
  classification: InboundClassification;
  /** The providerMatch (activity 1) outcome, forwarded exactly as classifyInbound
   *  receives it — populates `TriagePolicyContext.providerMatchState` (carried for
   *  telemetry/future rungs only; `decideTriage` does not branch on it today). */
  matchState?: 'matched' | 'unmatched' | 'ambiguous';
}

/** ALL gates forced on — the `shadow` decision (would-be action, telemetry only; see the
 *  module doc). A literal, NOT `@cs/domain/gates`, because shadow deliberately ignores
 *  the real env gates. */
const GATES_ALL_ON: TriagePolicyGates = {
  refGate: true,
  cancellation: true,
  imagesRouting: true,
  caseUpdate: true,
};

/** No live context resolved (a failed /triage/context read) — the SAFE degrade: with no
 *  matches, no duplicate flag, and no siblings, `decideTriage` cannot fire an ATTACH or a
 *  targeted cancellation (this module's inviolable no-silent-merge rule stays intact); at
 *  worst it proposes a targetless cancellation or fires the images-unmatched rung — never
 *  a wrong link. */
const EMPTY_CONTEXT: TriageContextResult = {
  openCaseMatches: [],
  duplicateInternetMessageId: false,
  conversationSiblingCaseIds: [],
};

/** The REAL gates the `acting` decision reads — one place, so this activity and
 *  gates.ts can never disagree about the four TRIAGE_* app-settings. */
function actingGates(): TriagePolicyGates {
  return {
    refGate: gates.triageRefGate(),
    cancellation: gates.triageCancellation(),
    imagesRouting: gates.triageImagesRouting(),
    caseUpdate: gates.triageCaseUpdate(),
  };
}

/** Defensive re-assertion (mirrors dedup.ts / triage-policy.ts's own "never trust the
 *  caller blindly" discipline): narrow an arbitrary providerMatch outcome to the
 *  `TriagePolicyContext.providerMatchState` vocabulary, defaulting an absent/unrecognised
 *  value to 'none' (distinct from 'unmatched' — "not computed" vs. "tried and failed"). */
function normaliseMatchState(value: unknown): TriagePolicyContext['providerMatchState'] {
  return value === 'matched' || value === 'unmatched' || value === 'ambiguous' ? value : 'none';
}

/**
 * Build the `/api/internal/triage/context` request body — pure, so it is unit-testable
 * without the Durable activity harness (mirrors classifyInbound's `buildClassifyRequest`
 * split). Mirrors the existing linkReply lane's own ref/VRM precedence — the best-known
 * post-parse value (`candidateRef`/`candidateVrm`) over the classifier's body sniff — plus
 * the job-ref/Internet-Message-Id/conversation signals the ref-gate and duplicate/thread
 * rungs need. Every field is a plain (possibly empty) string; none are conditionally
 * omitted, so the API always parses one shape.
 */
export function buildTriageContextRequest(
  inbound: Pick<InboundEnvelope, 'candidateRef' | 'candidateVrm' | 'internetMessageId' | 'conversationId'>,
  classification: Pick<InboundClassification, 'bodyCaseref' | 'bodyVrm' | 'bodyJobref'>,
): TriageContextRequest {
  return {
    caseref: (inbound.candidateRef || classification.bodyCaseref || '').trim(),
    jobref: (classification.bodyJobref || '').trim(),
    vrm: (inbound.candidateVrm || classification.bodyVrm || '').trim(),
    internetMessageId: (inbound.internetMessageId || '').trim(),
    conversationId: (inbound.conversationId || '').trim(),
  };
}

/**
 * Derive the attachment signals `TriagePolicyContext` needs (`hasAttachments`,
 * `attachmentKinds`, `imagesOnly`) from the envelope — reuses classifyInbound's
 * `attachmentKindsOf` (D10 — the SAME `describeEvidence` rule) so classification and
 * triage policy never disagree about what an attachment IS. Pure; unit-testable.
 */
export function deriveAttachmentSignals(inbound: Pick<InboundEnvelope, 'attachments'>): {
  hasAttachments: boolean;
  attachmentKinds: string[];
  imagesOnly: boolean;
} {
  const attachmentKinds = attachmentKindsOf(inbound);
  const hasAttachments = inbound.attachments.length > 0;
  const imagesOnly = hasAttachments && attachmentKinds.every((kind) => kind === 'image');
  return { hasAttachments, attachmentKinds, imagesOnly };
}

/** Stage-A's classification + envelope -> the pure `TriagePolicyClassification` shape
 *  `decideTriage` takes. A straight field carry-through (never branches) — its own
 *  function so the mapping is documented once. */
function toPolicyClassification(classification: InboundClassification): TriagePolicyClassification {
  return {
    category: classification.category,
    subtype: classification.subtype,
    confidence: classification.confidence,
    signals: classification.signals,
    bodyVrm: classification.bodyVrm,
    bodyCaseref: classification.bodyCaseref,
    bodyJobref: classification.bodyJobref,
    isReply: classification.isReply,
    taxonomyVersion: classification.taxonomyVersion,
  };
}

df.app.activity('triagePolicy', {
  handler: async (input: TriagePolicyInput, ctx): Promise<TriagePolicyDecision> => {
    const { inbound, classification } = input;

    let resolvedContext: TriageContextResult;
    try {
      resolvedContext = await dataApi.triageContext(buildTriageContextRequest(inbound, classification));
    } catch (e) {
      ctx.warn(
        `[triagePolicy] context lookup failed for ${inbound.internetMessageId} — degrading to an empty context (best-effort, additive feature; never blocks intake): ${e instanceof Error ? e.message : String(e)}`,
      );
      resolvedContext = EMPTY_CONTEXT;
    }

    const { hasAttachments, attachmentKinds, imagesOnly } = deriveAttachmentSignals(inbound);
    const policyClassification = toPolicyClassification(classification);
    const policyContext: TriagePolicyContext = {
      openCaseMatches: resolvedContext.openCaseMatches,
      duplicateInternetMessageId: resolvedContext.duplicateInternetMessageId,
      conversationSiblingCaseIds: resolvedContext.conversationSiblingCaseIds,
      providerMatchState: normaliseMatchState(input.matchState),
      hasAttachments,
      attachmentKinds,
      imagesOnly,
    };

    const actingGateValues = actingGates();
    const shadow = decideTriage(policyClassification, policyContext, GATES_ALL_ON);
    const acting = decideTriage(policyClassification, policyContext, actingGateValues);

    await trackEvent('triage_decision', {
      actingAction: acting.action,
      shadowAction: shadow.action,
      actingFinalCategory: acting.finalCategory,
      actingFinalSubtype: acting.finalSubtype,
      shadowFinalCategory: shadow.finalCategory,
      shadowFinalSubtype: shadow.finalSubtype,
      policyVersion: acting.policyVersion,
      gatesSnapshot: actingGateValues,
      messageId: inbound.messageId,
      sourceMailbox: inbound.sourceMailbox,
      decisionInputs: shadow.decisionInputs,
      taxonomyVersion: classification.taxonomyVersion ?? 1,
    });

    // ai_suggestion write — ONLY the ACTING decision ever writes one (never shadow: "no
    // shadow rows in ai_suggestion while its gate is off", ADR-0019 §5). Best-effort: a
    // suggestion-write failure must never sink intake (the module doc's reliability note).
    if (acting.action === 'suggest_attach' || acting.action === 'propose_cancellation') {
      try {
        await dataApi.triageSuggestLink({
          sourceMessageId: inbound.internetMessageId,
          ...(acting.targetCaseId ? { targetCaseId: acting.targetCaseId } : {}),
          suggestionType: acting.suggestionType ?? (acting.action === 'propose_cancellation' ? 'cancellation' : 'case_link'),
          rationale: acting.rationale,
          ...(policyClassification.confidence !== undefined ? { confidence: policyClassification.confidence } : {}),
          decisionInputs: acting.decisionInputs,
        });
      } catch (e) {
        ctx.warn(
          `[triagePolicy] suggestion write failed for ${inbound.internetMessageId} (best-effort, continuing): ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    ctx.log(
      JSON.stringify({
        evt: 'triagePolicy',
        messageId: inbound.messageId,
        actingAction: acting.action,
        shadowAction: shadow.action,
      }),
    );

    // Durable-checkpointed return — the orchestrator routes on THIS value, never
    // recomputing the decision itself (all I/O + policy evaluation happens here, once).
    return acting;
  },
});
