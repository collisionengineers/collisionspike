/** *
 * Durable activity: the IMAGE-DELIVERY document-VRM match rung. Some image-delivery
 * emails — the Tractable "New completed lead…" shape — carry NO registration or reference
 * in their subject/body: the match key lives INSIDE the attached PDF (its Vehicle
 * Information block). By the time this runs, the ordinary subject/body machinery
 * (triagePolicy, activity 1.55) has already found nothing, and the orchestrator has
 * re-used the EXISTING `parse` activity over the PDF attachment(s); the PDF-extracted VRM
 * arrives here as a plain input.
 *
 * This activity feeds that VRM into the EXISTING machinery — never a parallel pipeline:
 *   - context read → the same `POST /api/internal/triage/context` the triage policy uses
 *     (VRM key only; the email had no other signals or we would not be here);
 *   - EXACTLY ONE open-case match → the same `case_link` ai_suggestion write
 *     (dataApi.triageSuggestLink) the ref-gate rung produces. SUGGEST-FIRST ONLY: a
 *     VRM-only match NEVER auto-attaches (ADR-0010 / triage-policy.ts's permanent
 *     inviolable rule) — a person accepts the suggestion from the inbox, exactly as for
 *     any other suggest_attach.
 *   - none / several → the same TKT-034 visible flag (attention_reason
 *     'images_no_match') the unmatched-images lane stamps. No case is ever minted here
 *     (no spurious work) — flag-for-review is the whole fallback.
 *
 * GATES (read HERE, never in the orchestrator — the parse/enrich/boxArchive convention):
 * the suggestion write needs TRIAGE_REF_GATE_ENABLED (it IS ref-gate machinery); the
 * attention flag needs TRIAGE_IMAGES_ROUTING_ENABLED (the TKT-034 lane's own gate). With
 * both off the activity is a no-op, so the rung is inert exactly like the other TRIAGE_*
 * rungs (kill-switch discipline).
 *
 * Idempotent / replay-safe: the context read is a pure lookup; the suggestion write is
 * idempotent server-side (an equivalent PENDING suggestion → created:false, never a
 * duplicate row); the attention stamp re-applies the same value. Best-effort by placement:
 * the orchestrator try/catch-wraps the call, so this lane can never sink intake.
 */

import * as df from 'durable-functions';
import { canonicalizeVrm, distinctByCaseId } from '@cs/domain';
import type { TriagePolicyDecision } from '@cs/domain';
import { gates } from '@cs/domain/gates';
import { dataApi } from '../../adapters/data-api.js';
import type { InboundClassification } from '../intake/classifyInbound.js';

interface ImagesReceivedVrmMatchInput {
  /** The email's Internet-Message-Id — the suggestion write's subject key AND the
   *  attention stamp's key (both resolve the inbound_email row from it server-side). */
  internetMessageId?: string;
  /** The registration the parse activity extracted from the PDF attachment(s); '' / absent
   *  when the parser found none (or was gated off / skipped). */
  vrm?: string;
  /** The registration the subject/body machinery ALREADY tried against open cases (it
   *  found nothing, or this rung would never have been scheduled). A PDF that merely
   *  repeats it cannot produce a different answer — skip straight to the flag. */
  triedVrm?: string;
}

/* ----------  Pure helpers (exported for unit tests)  ---------- */

const PDF_NAME_RE = /\.pdf$/i;
const PDF_CTYPE_RE = /pdf/i;

/**
 * Orchestrator-side scheduling predicate — pure over CHECKPOINTED values only (the
 * shouldAttemptTriageAssist convention; NEVER reads process.env — the real gates live in
 * the activity). True when this non-minting arrival is an image-delivery email (subtype
 * images_received, from Stage A or the triage relabel) that the subject/body machinery
 * did NOT match to a case, and that carries at least one PDF attachment worth parsing
 * for its registration.
 */
export function shouldAttemptPdfVrmMatch(
  classification: Pick<InboundClassification, 'subtype'>,
  triage: Pick<TriagePolicyDecision, 'action' | 'finalSubtype'>,
  attachments: ReadonlyArray<{ filename?: string; contentType?: string }> | undefined,
): boolean {
  const imagesReceived =
    classification.subtype === 'images_received' || triage.finalSubtype === 'images_received';
  if (!imagesReceived) return false;
  // A subject/body signal already matched a case (suggested or auto-attached) — the
  // existing machinery has it; this rung adds nothing.
  if (triage.action === 'suggest_attach' || triage.action === 'attach_case') return false;
  return (attachments ?? []).some(
    (a) => PDF_NAME_RE.test(a.filename ?? '') || PDF_CTYPE_RE.test(a.contentType ?? ''),
  );
}

export type VrmMatchPlan =
  | { step: 'skip'; reason: 'gate_off' | 'flag_gate_off' }
  | { step: 'flag'; reason: 'no_registration' | 'already_tried' | 'suggest_gate_off' }
  | { step: 'lookup'; vrm: string };

/**
 * Phase 1 (pure): decide whether to look up open cases at all. With both gates off the
 * whole rung is a no-op; without a usable (new) registration, or with the ref-gate off,
 * the outcome can only ever be the visible flag — which itself needs the images-routing
 * gate to be on.
 */
export function planVrmMatch(input: {
  vrm: string;
  triedVrm: string;
  refGate: boolean;
  imagesRouting: boolean;
}): VrmMatchPlan {
  if (!input.refGate && !input.imagesRouting) return { step: 'skip', reason: 'gate_off' };
  const flagOr = (reason: 'no_registration' | 'already_tried' | 'suggest_gate_off'): VrmMatchPlan =>
    input.imagesRouting ? { step: 'flag', reason } : { step: 'skip', reason: 'flag_gate_off' };
  const vrm = canonicalizeVrm(input.vrm ?? '');
  if (!vrm) return flagOr('no_registration');
  const tried = canonicalizeVrm(input.triedVrm ?? '');
  if (tried && vrm === tried) return flagOr('already_tried');
  if (!input.refGate) return flagOr('suggest_gate_off');
  return { step: 'lookup', vrm };
}

export type VrmMatchResolution =
  | { step: 'suggest'; target: { caseId: string; casePo: string } }
  | { step: 'flag'; reason: 'no_open_case' | 'multiple_open_cases' };

/**
 * Phase 2 (pure): resolve the context read's open-case matches. EXACTLY ONE distinct open
 * case → suggest attaching (never attach — VRM-only, the permanent ADR-0010 rule); zero
 * or several → the visible TKT-034 flag for a person to place. Dedup by case id is the
 * shared `@cs/domain` primitive (`distinctByCaseId`, also used by triage-policy.ts's
 * cardinality rungs) — only the primitive is shared; the suggest/flag decision here stays
 * its own, since it differs from triage-policy's rung logic.
 */
export function resolveVrmMatches(
  matches: ReadonlyArray<{ caseId: string; casePo: string }>,
): VrmMatchResolution {
  const distinct = distinctByCaseId(matches);
  if (distinct.length === 1) {
    return { step: 'suggest', target: distinct[0] };
  }
  return {
    step: 'flag',
    reason: distinct.length === 0 ? 'no_open_case' : 'multiple_open_cases',
  };
}

/* ----------  The activity  ---------- */

df.app.activity('imagesReceivedVrmMatch', {
  handler: async (
    input: ImagesReceivedVrmMatchInput,
    ctx,
  ): Promise<{ outcome: string; caseId?: string }> => {
    const internetMessageId = (input.internetMessageId ?? '').trim();
    if (!internetMessageId) {
      // Without the message key neither the suggestion nor the flag can land anywhere.
      return { outcome: 'skipped:no_message_id' };
    }

    const plan = planVrmMatch({
      vrm: input.vrm ?? '',
      triedVrm: input.triedVrm ?? '',
      refGate: gates.triageRefGate(),
      imagesRouting: gates.triageImagesRouting(),
    });
    if (plan.step === 'skip') {
      ctx.log(JSON.stringify({ evt: 'imagesReceivedVrmMatch', outcome: 'skipped', reason: plan.reason }));
      return { outcome: `skipped:${plan.reason}` };
    }

    let flagReason: string = plan.step === 'flag' ? plan.reason : '';
    if (plan.step === 'lookup') {
      let matches: Array<{ caseId: string; casePo: string }> = [];
      try {
        const context = await dataApi.triageContext({
          caseref: '',
          jobref: '',
          vrm: plan.vrm,
          internetMessageId: '',
          conversationId: '',
        });
        matches = context.openCaseMatches;
      } catch (e) {
        // Degrade to the FLAG, never a guessed link (the triagePolicy empty-context
        // convention: a lookup blip must not invent a match).
        ctx.warn(
          `[imagesReceivedVrmMatch] context lookup failed for ${internetMessageId} (degrading to the visible flag): ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      const resolution = resolveVrmMatches(matches);
      if (resolution.step === 'suggest') {
        const target = resolution.target;
        try {
          await dataApi.triageSuggestLink({
            sourceMessageId: internetMessageId,
            targetCaseId: target.caseId,
            suggestionType: 'case_link',
            // HANDLER-LANGUAGE (rendered in the SPA's "Why this label?" — the
            // triage-policy.ts rationale precedent; no engineering terms).
            rationale: `The attached document shows registration ${plan.vrm}, which matches open case ${target.casePo} — suggested attaching this email to it.`,
            decisionInputs: {
              rung: 'images_received_pdf_vrm',
              vrm: plan.vrm,
              triedVrm: input.triedVrm ?? '',
              matchCount: 1,
            },
          });
        } catch (e) {
          ctx.warn(
            `[imagesReceivedVrmMatch] suggestion write failed for ${internetMessageId} (best-effort, continuing): ${e instanceof Error ? e.message : String(e)}`,
          );
          return { outcome: 'suggest_failed', caseId: target.caseId };
        }
        ctx.log(
          JSON.stringify({ evt: 'imagesReceivedVrmMatch', outcome: 'suggested', caseId: target.caseId, vrm: plan.vrm }),
        );
        return { outcome: 'suggested', caseId: target.caseId };
      }
      flagReason = resolution.reason;
    }

    // FLAG path — the existing TKT-034 visible chip ('images_no_match'), same gate
    // discipline as its scheduling rung (TRIAGE_IMAGES_ROUTING_ENABLED).
    if (!gates.triageImagesRouting()) {
      ctx.log(JSON.stringify({ evt: 'imagesReceivedVrmMatch', outcome: 'skipped', reason: 'flag_gate_off', flagReason }));
      return { outcome: 'skipped:flag_gate_off' };
    }
    let stamped = false;
    try {
      const res = await dataApi.markInboundAttention({
        sourceMessageId: internetMessageId,
        reason: 'images_no_match',
      });
      stamped = res.stamped;
    } catch (e) {
      ctx.warn(
        `[imagesReceivedVrmMatch] attention stamp failed for ${internetMessageId} (best-effort): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    ctx.log(JSON.stringify({ evt: 'imagesReceivedVrmMatch', outcome: stamped ? 'flagged' : 'flag_failed', flagReason }));
    return { outcome: stamped ? `flagged:${flagReason}` : 'flag_failed' };
  },
});
