/**
 * orchestration/src/functions/gated/triage-classify.ts
 *
 * Gated orchestration (rules-engine-v2 Phase 4, ADR-0019 Stage C): a SUGGESTION-ONLY
 * second opinion for an inbound email Stage A (the deterministic classifier) could not
 * confidently place — abstain rows (category 'other' at/below the abstain confidence) and
 * rows carrying an `uncorroborated_*` signal flag (ADR-0015's 2026-06-29 update: target
 * the signal, not the confidence band alone). Gated by `EMAIL_AI_ENABLED` (the model call)
 * + a configured model endpoint/deployment — default off; the activity is itself the gate
 * (see `shouldAttemptTriageAssist` below for why the ORCHESTRATOR never reads the gate).
 *
 * Trigger today: manual → preserved as an HTTP starter (unchanged shape/route). The NEW
 * caller is `intakeOrchestrator.ts`'s post-classify branch (rules-engine-v2 Phase 4),
 * which schedules `triageClassifyOrchestrator` for every abstain/uncorroborated row.
 *
 * Never mutates a case or the inbound_email row directly: a non-abstain result is written
 * as a `suggestion_type='triage_category'` `ai_suggestion` row (via
 * `dataApi.triageSuggestClassification`) that a human accepts/rejects
 * (`api/src/functions/ai-suggestions.ts`'s `promoteAcceptedSuggestion`) — mirrors the
 * Stage-B triage-policy activity's own "suggestion write only, never an actor" contract.
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { scrubPii } from '@cs/domain';
import { callTriageModel } from '../../lib/aoai.js';
import { dataApi } from '../../lib/data-api.js';
import { trackEvent } from '../../lib/telemetry.js';

interface TriageInput {
  /** The (already-persisted) inbound_email row id, when the caller has it. Optional: the
   *  rules-engine-v2 Phase 4 post-classify caller (intakeOrchestrator.ts) runs before that
   *  id is threaded back to the orchestrator — the Data API resolves it from
   *  `sourceMessageId` instead (see internalTriageSuggestLink's own doc comment; the
   *  Stage-B triagePolicy activity already relies on the same resolution). */
  inboundEmailId?: string;
  /** The email's Internet-Message-Id — the suggest-link endpoint's fallback subject key
   *  when `inboundEmailId` is absent. */
  sourceMessageId?: string;
  subject?: string;
  body?: string;
  senderAddress?: string;
  /** Sender domain, when the caller already derived it (falls back to deriving it from
   *  `senderAddress` inside the activity when absent — e.g. a manual HTTP-starter call). */
  senderDomain?: string;
  attachmentFilenames?: string[];
  /** Stage A's own category/subtype/signals — passed through as CONTEXT for the model
   *  (never re-derived here; Stage A stays single-sourced in the vendored engine). */
  deterministicCategory?: string;
  deterministicSubtype?: string;
  deterministicSignals?: string[];
}

interface TriageClassifyResult {
  /** True when the activity no-op'd because EMAIL_AI_ENABLED/the model are off/unconfigured. */
  skipped?: boolean;
  /** True when the model call ran but abstained (no suggestion written). */
  abstained?: boolean;
  category?: string;
  subtype?: string;
}

/**
 * Pure, replay-deterministic gate for the CALLER (the orchestrator) — rules-engine-v2
 * Phase 4 / ADR-0019 Stage C. True exactly when Stage A's classification is either:
 *   - abstain: category 'other' at/below the abstain confidence band, OR
 *   - flagged uncorroborated: any signal starting `uncorroborated_` (ADR-0015's
 *     2026-06-29 update names two today — `uncorroborated_instruction_doc` /
 *     `uncorroborated_provider_image` — matched by PREFIX so a future addition needs no
 *     code change here).
 *
 * These two conditions are checked independently (not "abstain OR (uncorroborated AND
 * abstain)"): a corroborated ATTACHMENT can promote an email to `receiving_work` while a
 * DIFFERENT, unrelated attachment on the SAME email still carries an uncorroborated flag
 * (the vendored engine appends the flag before falling through to a later rule that may
 * yet promote via a different signal — see email_classifier.py Rule 1 -> Rule 2) — that
 * row is still worth a second opinion even though its final category is 'receiving_work',
 * not 'other'.
 *
 * DELIBERATELY reads NOTHING from `process.env` — a Durable orchestrator must replay to
 * the SAME decisions on every replay, and `process.env` is not a replay-safe input.
 * `EMAIL_AI_ENABLED` / the model-configured check are NOT evaluated here: they live
 * inside the `triageClassify` ACTIVITY (below), which already returns `{ skipped: true }`
 * when off — an activity, unlike the orchestrator body, is allowed to read env because its
 * RESULT (not its internal env read) is what gets checkpointed and replayed. So with the
 * gate off, this predicate still returns true for the qualifying subset of rows and the
 * orchestrator still schedules the activity call for them — but that call is cheap (an
 * immediate `{ skipped: true }`, no model call), never "unconditionally scheduled for
 * every email" (which this module's design explicitly rejected as too broad).
 */
export function shouldAttemptTriageAssist(classification: {
  category: string;
  confidence?: number;
  signals?: readonly string[];
}): boolean {
  const ABSTAIN_CONFIDENCE_CEILING = 0.35;
  const isAbstain = classification.category === 'other' && (classification.confidence ?? 1) <= ABSTAIN_CONFIDENCE_CEILING;
  const isUncorroborated = (classification.signals ?? []).some((s) => s.startsWith('uncorroborated_'));
  return isAbstain || isUncorroborated;
}

function domainOf(address: string): string {
  const at = address.lastIndexOf('@');
  return at >= 0 ? address.slice(at + 1).toLowerCase().trim() : '';
}

app.http('triage-classify-start', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'triage-classify',
  extraInputs: [df.input.durableClient()],
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const input = (await req.json()) as TriageInput;
    const client = df.getClient(ctx);
    const instanceId = await client.startNew('triageClassifyOrchestrator', { input });
    return client.createCheckStatusResponse(req, instanceId);
  },
});

const retry = new df.RetryOptions(5_000, 3);
retry.backoffCoefficient = 2;

df.app.orchestration('triageClassifyOrchestrator', function* (ctx) {
  const input = ctx.df.getInput() as TriageInput;
  const result = yield ctx.df.callActivityWithRetry('triageClassify', retry, input);
  return result;
});

df.app.activity('triageClassify', {
  handler: async (input: TriageInput, ctx): Promise<TriageClassifyResult> => {
    // The REAL gate — an activity may read process.env freely (see shouldAttemptTriageAssist's
    // doc for why the orchestrator itself never does). Two-part, matching ADR-0019 §3's
    // "EMAIL_AI_ENABLED (the model call)" plus the honest-no-op-when-unconfigured
    // convention already established for the case-level AI-assist route
    // (api/src/functions/ai-suggestions.ts's generateAiSuggestions).
    if (!gates.emailAi() || !gates.aiAssistConfigured()) {
      ctx.log('[triageClassify] skipped — EMAIL_AI_ENABLED off or model endpoint/deployment not configured');
      return { skipped: true };
    }

    // PII pre-scrub BEFORE anything leaves this process (ADR-0019 §3 / Phase 4 "PII +
    // policy posture"). VRM is NOT scrubbed by default (pii-scrub.ts: it is vehicle-
    // identity, the domain key, not claimant PII) — load-bearing for triage, kept as-is.
    const subjectScrub = scrubPii(input.subject ?? '');
    const bodyScrub = scrubPii(input.body ?? '');

    const result = await callTriageModel({
      subjectScrubbed: subjectScrub.text,
      bodyScrubbed: bodyScrub.text,
      senderDomain: input.senderDomain || domainOf(input.senderAddress ?? ''),
      attachmentFilenames: input.attachmentFilenames ?? [],
      deterministicCategory: input.deterministicCategory ?? '',
      deterministicSubtype: input.deterministicSubtype ?? '',
      deterministicSignals: input.deterministicSignals ?? [],
    });

    // Counts-only PII telemetry (chars/redaction COUNTS, never content — mirrors
    // pii-scrub.ts's own "safe to log" contract). Fire-and-forget; trackEvent never throws.
    await trackEvent('triage_llm_assist', {
      abstain: 'abstain' in result,
      reason: 'abstain' in result ? result.reason : undefined,
      subjectRedactions: subjectScrub.totalRedactions,
      bodyRedactions: bodyScrub.totalRedactions,
      deterministicCategory: input.deterministicCategory,
      deterministicSubtype: input.deterministicSubtype,
    });

    if ('abstain' in result) {
      ctx.log(JSON.stringify({ evt: 'triageClassify', abstain: true, reason: result.reason }));
      return { skipped: false, abstained: true };
    }

    // '<deployment>:<modelVersion-from-response>' — capture whatever the response actually
    // carried (model, else system_fingerprint, else 'unknown'; see aoai.ts's doc on why
    // both are exposed). Never invented, never blocking: a write failure here is
    // best-effort (mirrors the Stage-B triagePolicy activity's own suggestion-write
    // try/catch) — the model call already happened; losing the suggestion write must not
    // fail the whole (retried) activity and re-trigger a second, costly model call.
    const modelVersion = `${gates.aiModelDeployment()}:${result.responseModel ?? result.systemFingerprint ?? 'unknown'}`;
    try {
      await dataApi.triageSuggestClassification({
        ...(input.sourceMessageId ? { sourceMessageId: input.sourceMessageId } : {}),
        ...(input.inboundEmailId ? { inboundEmailId: input.inboundEmailId } : {}),
        category: result.category,
        subtype: result.subtype,
        rationale: result.rationale,
        confidence: result.confidence,
        modelVersion,
      });
    } catch (e) {
      ctx.warn(
        `[triageClassify] suggestion write failed (best-effort, continuing): ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    ctx.log(JSON.stringify({ evt: 'triageClassify', category: result.category, subtype: result.subtype }));
    return { skipped: false, abstained: false, category: result.category, subtype: result.subtype };
  },
});
