/** *
 * Durable activity: composes classifyInbound.ts (Stage A) + triagePolicy.ts (Stage B)
 * into ONE activity call (PLAN-014 Slice 4a/4b — parse-fed unified triage reorder).
 *
 * This slice (4a) does NOT reorder the orchestrator: `triageUnified` is called from the
 * SAME position the two-call `classifyInbound`+`triagePolicy` sequence occupies today, so
 * it still runs BEFORE `parse`. With `TRIAGE_PARSE_FED_ENABLED` off, this activity's
 * output is BYTE-IDENTICAL to calling `classifyInbound` then `triagePolicy` separately —
 * proven by a dedicated gate-off-parity test (`triageUnified.test.ts`). The two old
 * activities stay registered, UNMODIFIED, for Durable in-flight replay safety across this
 * deploy (see their own module docs' supersession banners) — do not remove either until a
 * follow-up release confirms no in-flight instance predates the flip.
 *
 * With the gate ON, this activity ADDITIONALLY runs a pre-classify open-case lookup
 * (D1 "Lookup A") so `open_case_ref_match` can reach the classify-email call itself —
 * closing the exact gap `detection/attachment_typing.py`'s own docstring names ("the
 * classifier judges attachments by filename/extension heuristics... cannot feed back...
 * without a pipeline reorder"). Slice 4a has NO parse result available yet at this call
 * site (that is Slice 4b's reorder) — `attachment_content_typings` is therefore always
 * empty here; Slice 4b is what starts populating it. The exported builders below already
 * accept optional `parserVrm`/`parserRef` so Slice 4b only needs to THREAD real values
 * through, not redesign this activity.
 */

import * as df from 'durable-functions';
import {
  decideTriage,
  distinctByCaseId,
  type TriagePolicyClassification,
  type TriagePolicyContext,
  type TriagePolicyDecision,
  type TriagePolicyGates,
} from '@cs/domain';
import { gates } from '@cs/domain/gates';
import { dataApi, type TriageContextRequest, type TriageContextResult } from '../../adapters/data-api.js';
import { callClassifyEmail } from '../../adapters/functions-client.js';
import { trackEvent } from '../../platform/telemetry.js';
import {
  attachmentKindsOf,
  buildClassifyRequest,
  resolveActingClassification,
  type InboundClassification,
} from './classifyInbound.js';
import { resolveCaseRef, resolveCaseVrm } from './case-identity.js';
import type { InboundEnvelope } from './fetchMessage.js';

interface TriageUnifiedInput {
  inbound: InboundEnvelope;
  workProviderId?: string;
  matchState?: 'matched' | 'unmatched' | 'ambiguous';
  /** rules-engine-v2 Phase 3 (ADR-0011) — forwarded to telemetry only, mirrors
   *  triagePolicy.ts's own TriagePolicyInput. */
  intermediaryImageSourceId?: string;
  intermediaryCandidateProviderIds?: string[];
  /** PLAN-014 — the hoisted parse result's identity fields + per-attachment content typings,
   *  supplied by the orchestrator once parse runs BEFORE triage (Slice 4b's reorder). Consumed
   *  ONLY when gates.triageParseFed() is on (D1 open-case probe / open_case_ref_match, D4
   *  attachment_content_typings, AND the ref/VRM injected into the policy classification so a
   *  document-only ref reaches decideTriage's ref-gate). Absent/empty until Slice 4b threads it
   *  — in Slice 4a the orchestrator never passes it, so every parse-fed input stays empty here. */
  parsed?: {
    parserVrm?: string;
    parserRef?: string;
    attachmentTypings?: ReadonlyArray<{ filename: string; docType: string }>;
  };
}

export interface TriageUnifiedResult {
  classification: InboundClassification;
  decision: TriagePolicyDecision;
  /** Whether the parse-fed feature (TRIAGE_PARSE_FED_ENABLED) was ON for this arrival — a
   *  CHECKPOINTED value the Slice-4b orchestrator branches on to decide whether the downstream
   *  lanes (attach_case evidence VRM, route_images_unmatched VRM, reply-link ref/VRM) may use
   *  the hoisted parser VRM/ref, WITHOUT re-reading process.env in the orchestrator body
   *  (Durable determinism). False when the gate is off → those lanes stay byte-identical. */
  parseFedGateOn: boolean;
}

/* ---- images-only-delivery detection (TKT-043) — MOVED from the now-deleted
 * triagePolicy.ts (email-engine-rebuild: that file's registered `triagePolicy` Durable
 * activity had no remaining caller, but these pure helpers do — triageUnified.ts is now
 * their sole home). Kept in LOCKSTEP with the vendored classifier's
 * `_delivered_images_only` (services/functions/parser/cedocumentmapper_v2/rules/
 * email_classifier.py): the extension-derived attachment kind reads a photos-in-a-PDF
 * ("images - cvd.pdf") as `instruction`, so a chaser that delivers its damage photos AS
 * a single images PDF would fall to case_update/update_general. The FILENAME tier below
 * recovers it so the triage policy sees imagesOnly=true -> images_received, matching
 * Stage A. A signature logo ("imageNNN.png") never counts as delivered evidence; an
 * engineer's REPORT disqualifies the images-only reading (it is existing-work, not new
 * evidence).
 *
 * TKT-307: digit run is UNBOUNDED, in lockstep with the Python twin — a capped \d{1,4}
 * let a six-digit Outlook cid (image078315.png) read as genuine evidence. The fix landed
 * on triagePolicy.ts, which this rebuild deleted after moving these helpers here; it is
 * re-applied by hand to this copy, since this is now the only live one. */
const _SIGNATURE_IMAGE_RE = /^image0*\d+\.(?:png|jpe?g|gif|bmp)$/i;
const _IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'heic', 'webp', 'tif', 'tiff']);
const _IMAGE_EVIDENCE_HINT_RE = /(?:images?|photos?|damage|\bimg[\W_]|vd\s*image)/i;
const _REPORT_FILENAME_RE = /(engineer'?s?report|reportv\d|report\.(?:pdf|docx?)$|finalreport|draftreport|auditreport)/i;

function _isReportFilename(name: string): boolean {
  return _REPORT_FILENAME_RE.test(name.replace(/[\s_-]+/g, '').toLowerCase());
}

function _isImageEvidenceFilename(name: string): boolean {
  const base = name.trim();
  if (!base || _SIGNATURE_IMAGE_RE.test(base) || _isReportFilename(base)) return false;
  const dot = base.lastIndexOf('.');
  const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
  return _IMAGE_EXTENSIONS.has(ext) || _IMAGE_EVIDENCE_HINT_RE.test(base);
}

/** True when the NEW EVIDENCE delivered is photos and nothing else — by KIND (every
 *  attachment an image) OR by FILENAME (every non-signature attachment is image evidence,
 *  none a report). Mirrors the classifier's `_delivered_images_only`. */
export function deliveredImagesOnly(attachmentKinds: readonly string[], filenames: readonly string[]): boolean {
  // Drop signature/logo images (imageNNN.png) FIRST. A reply carrying ONLY a signature logo
  // must not read as delivered photo evidence — even though its KIND is `image`, which used to
  // let the all-image kind fast-path short-circuit to true before the filename filter ran
  // (PR#45 / TKT-043 review). So the fast-path is now guarded on there being ≥1 non-signature file.
  const nonSignature = filenames
    .map((f) => (f ?? '').trim())
    .filter((f) => f && !_SIGNATURE_IMAGE_RE.test(f));
  if (nonSignature.length === 0) return false; // nothing but signature logos delivered
  if (nonSignature.some(_isReportFilename)) return false; // a report disqualifies images-only
  // KIND tier — every attachment is an image kind (real .jpg/.png photos); guarded above so a
  // set made only of signature images can no longer qualify.
  if (attachmentKinds.length > 0 && attachmentKinds.every((kind) => kind === 'image')) return true;
  // FILENAME tier — every non-signature attachment is image evidence (photos-in-a-PDF, TKT-043).
  return nonSignature.every(_isImageEvidenceFilename);
}

/**
 * Derive the attachment signals `TriagePolicyContext` needs (`hasAttachments`,
 * `attachmentKinds`, `imagesOnly`) from the envelope — reuses classifyInbound's
 * `attachmentKindsOf` (D10 — the SAME `describeEvidence` rule) so classification and
 * triage policy never disagree about what an attachment IS. `imagesOnly` additionally
 * applies the `deliveredImagesOnly` FILENAME tier (TKT-043), kept in lockstep with the
 * classifier's `_delivered_images_only`, so a photos-in-a-PDF the extension-derived kind
 * reads as `instruction` still yields images_received. Pure; unit-testable.
 */
export function deriveAttachmentSignals(inbound: Pick<InboundEnvelope, 'attachments'>): {
  hasAttachments: boolean;
  attachmentKinds: string[];
  imagesOnly: boolean;
} {
  const attachmentKinds = attachmentKindsOf(inbound);
  const hasAttachments = inbound.attachments.length > 0;
  const filenames = inbound.attachments.map((a) => a.filename ?? '');
  const imagesOnly = hasAttachments && deliveredImagesOnly(attachmentKinds, filenames);
  return { hasAttachments, attachmentKinds, imagesOnly };
}

/**
 * Build the `/api/internal/triage/context` request body — pure, kept exactly as it was
 * in the now-deleted triagePolicy.ts (email-engine-rebuild). Retained here ONLY as the
 * frozen reference `triageUnified.test.ts`'s gate-off parity test compares
 * `buildWidenedTriageContextRequest(.., {})` against — see that test's own doc comment.
 * Not called from triageUnified's own activity handler (buildWidenedTriageContextRequest
 * is its live equivalent).
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

/** ALL gates forced on — the `shadow` decision (would-be action, telemetry only).
 *  Literal, NOT `@cs/domain/gates`, matching triagePolicy.ts's own convention exactly. */
const GATES_ALL_ON: TriagePolicyGates = {
  refGate: true,
  cancellation: true,
  imagesRouting: true,
  caseUpdate: true,
  autoAttach: true,
};

/** No live context resolved — the SAFE degrade, identical to triagePolicy.ts's own. */
const EMPTY_CONTEXT: TriageContextResult = {
  openCaseMatches: [],
  duplicateInternetMessageId: false,
  conversationSiblingCaseIds: [],
};

function actingGates(): TriagePolicyGates {
  return {
    refGate: gates.triageRefGate(),
    cancellation: gates.triageCancellation(),
    imagesRouting: gates.triageImagesRouting(),
    caseUpdate: gates.triageCaseUpdate(),
    autoAttach: gates.triageAutoAttach(),
  };
}

function normaliseMatchState(value: unknown): TriagePolicyContext['providerMatchState'] {
  return value === 'matched' || value === 'unmatched' || value === 'ambiguous' ? value : 'none';
}

/**
 * Build the classification decideTriage sees. When parse-fed, a document-only Case-ref / VRM
 * (present ONLY inside an attachment, never in the subject/body the classifier scanned) is
 * injected into the ref signals so `decideTriage`'s `hasRefSignal` recognises it — WITHOUT this,
 * the widened context lookup finds the open case but the ref-gate rung (which defensively requires
 * a classification-level ref) falls through to the default action, defeating the whole parse-fed
 * ref-gate use case. Classifier-extracted refs still win (`||` order). ADR-0010 is preserved
 * structurally: any VRM-sourced match is tagged `matchedOn: 'vrm'` by the lookup, and
 * `triage-policy.ts`'s `matchedOn !== 'vrm'` guard blocks it from auto-attach regardless of how the
 * VRM reached the classification. `parsed` is empty in Slice 4a (nothing threads it yet), so this
 * is inert until Slice 4b's reorder.
 */
export function toPolicyClassification(
  classification: InboundClassification,
  parsed: { parserRef?: string; parserVrm?: string } = {},
): TriagePolicyClassification {
  const parserRef = (parsed.parserRef ?? '').trim();
  const parserVrm = (parsed.parserVrm ?? '').trim();
  return {
    category: classification.category,
    subtype: classification.subtype,
    confidence: classification.confidence,
    signals: classification.signals,
    bodyVrm: classification.bodyVrm || parserVrm,
    bodyCaseref: classification.bodyCaseref || parserRef,
    bodyJobref: classification.bodyJobref || parserRef,
    isReply: classification.isReply,
    taxonomyVersion: classification.taxonomyVersion,
  };
}

/**
 * D1 Lookup A — pre-classify open-case probe. `parsed` fields are undefined in Slice 4a
 * (no parse result exists yet at this call site) — Slice 4b threads real `parserVrm`/
 * `parserRef` through once the reorder makes them available.
 */
export function buildPreClassifyContextRequest(
  inbound: Pick<InboundEnvelope, 'candidateRef' | 'candidateVrm' | 'internetMessageId' | 'conversationId'>,
  parsed: { parserRef?: string; parserVrm?: string } = {},
): TriageContextRequest {
  return {
    caseref: resolveCaseRef({ parserRef: parsed.parserRef, candidateRef: inbound.candidateRef }),
    jobref: (parsed.parserRef ?? '').trim(),
    vrm: resolveCaseVrm({ parserVrm: parsed.parserVrm, candidateVrm: inbound.candidateVrm }),
    internetMessageId: (inbound.internetMessageId || '').trim(),
    conversationId: (inbound.conversationId || '').trim(),
  };
}

/** D1 — one/none/ambiguous from a set of open-case matches, distinct by case. Lookup
 *  failure/no-signal-to-check degrades to 'none' — the same default `classify_email()`
 *  itself uses for an absent/empty `open_case_ref_match`. */
export function resolveOpenCaseRefMatchState(matches: readonly { caseId: string }[]): 'one' | 'none' | 'ambiguous' {
  const distinct = distinctByCaseId(matches);
  if (distinct.length === 0) return 'none';
  if (distinct.length === 1) return 'one';
  return 'ambiguous';
}

/** D4 — the parser's per-attachment content typings, mapped to the wire shape. Always
 *  empty in Slice 4a (no parse result available yet at this call site); Slice 4b's
 *  reorder is what starts populating it from a real parse result. */
export function deriveContentTypings(
  attachmentTypings?: ReadonlyArray<{ filename: string; docType: string }>,
): Array<{ filename: string; docType: string }> {
  return attachmentTypings ? attachmentTypings.map((t) => ({ filename: t.filename, docType: t.docType })) : [];
}

/** D2 step 1 — the parse-fed classify request: today's byte-identical request
 *  (`buildClassifyRequest`, unchanged import), plus `openCaseRefMatch`/
 *  `attachmentContentTypings`. */
export function buildParseFedClassifyRequest(
  inbound: InboundEnvelope,
  matchState: 'matched' | 'unmatched' | 'ambiguous' | undefined,
  openCaseRefMatch: 'one' | 'none' | 'ambiguous' | '',
  attachmentContentTypings: Array<{ filename: string; docType: string }>,
): Parameters<typeof callClassifyEmail>[0] {
  return {
    ...buildClassifyRequest(inbound, matchState),
    // '' means "no open-case probe result" → omit (the client narrows to one|none|ambiguous).
    ...(openCaseRefMatch ? { openCaseRefMatch } : {}),
    attachmentContentTypings,
  };
}

/**
 * D1 Lookup B — post-classify, widened with the classifier's own extracted refs (and,
 * from Slice 4b onward, the parser's). Structurally identical to triagePolicy.ts's
 * `buildTriageContextRequest` when `parsed` is empty (proven by the gate-off parity
 * test) — kept as its own function (not a re-export) so Slice 4b can thread
 * `parserVrm`/`parserRef` through without touching the now-legacy-parity-frozen
 * `triagePolicy.ts`.
 */
export function buildWidenedTriageContextRequest(
  inbound: Pick<InboundEnvelope, 'candidateRef' | 'candidateVrm' | 'internetMessageId' | 'conversationId'>,
  classification: Pick<InboundClassification, 'bodyCaseref' | 'bodyVrm' | 'bodyJobref'>,
  parsed: { parserRef?: string; parserVrm?: string } = {},
): TriageContextRequest {
  return {
    caseref: resolveCaseRef({
      parserRef: parsed.parserRef,
      candidateRef: inbound.candidateRef,
      bodyCaseref: classification.bodyCaseref,
    }),
    jobref: (classification.bodyJobref || parsed.parserRef || '').trim(),
    vrm: resolveCaseVrm({
      parserVrm: parsed.parserVrm,
      candidateVrm: inbound.candidateVrm,
      bodyVrm: classification.bodyVrm,
    }),
    internetMessageId: (inbound.internetMessageId || '').trim(),
    conversationId: (inbound.conversationId || '').trim(),
  };
}

df.app.activity('triageUnified', {
  handler: async (input: TriageUnifiedInput, ctx): Promise<TriageUnifiedResult> => {
    const { inbound, workProviderId, matchState } = input;
    const parseFedOn = gates.triageParseFed();

    // ---- Stage A: classify (D1 Lookup A + D4, gated; byte-identical request when off) ----
    let openCaseRefMatch: 'one' | 'none' | 'ambiguous' | '' = '';
    if (parseFedOn) {
      const preContextRequest = buildPreClassifyContextRequest(inbound, input.parsed);
      if (preContextRequest.caseref || preContextRequest.vrm) {
        try {
          const preContextResult = await dataApi.triageContext(preContextRequest);
          openCaseRefMatch = resolveOpenCaseRefMatchState(preContextResult.openCaseMatches);
        } catch (e) {
          ctx.warn(
            `[triageUnified] pre-classify context lookup failed for ${inbound.internetMessageId} — degrading to 'none' (best-effort, additive; never blocks intake): ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }
    const contentTypings = parseFedOn ? deriveContentTypings(input.parsed?.attachmentTypings) : [];

    const classifyRequest = parseFedOn
      ? buildParseFedClassifyRequest(inbound, matchState, openCaseRefMatch, contentTypings)
      : buildClassifyRequest(inbound, matchState);
    const res = await callClassifyEmail(classifyRequest);

    const acting = resolveActingClassification(
      res.category ?? '',
      res.subtype ?? '',
      gates.triagePreInstruction(),
    );
    if (acting.demoted) {
      ctx.log(
        JSON.stringify({
          evt: 'triageUnified',
          messageId: inbound.messageId,
          demoted: 'pre_instruction->other (TRIAGE_PRE_INSTRUCTION_ENABLED off)',
        }),
      );
    }
    const classification: InboundClassification = {
      category: acting.category,
      subtype: acting.subtype,
      confidence: res.confidence ?? 0,
      signals: res.signals ?? [],
      bodyVrm: res.body_vrm ?? '',
      bodyCaseref: res.body_caseref ?? '',
      bodyJobref: res.body_jobref ?? '',
      isReply: res.is_reply ?? false,
      taxonomyVersion: res.taxonomy_version,
    };

    await dataApi.recordInboundEmail({ inbound, providerId: workProviderId, classification });
    await dataApi.recordAudit({
      action: 'inbound_classified',
      summary: `triage ${classification.category}/${classification.subtype} (conf ${classification.confidence})`,
    });
    ctx.log(
      JSON.stringify({
        evt: 'triageUnified',
        messageId: inbound.messageId,
        category: classification.category,
        subtype: classification.subtype,
      }),
    );

    // ---- Stage B: triage policy (D1 Lookup B — ALWAYS a fresh, post-classify context read) ----
    // Not reused from Lookup A: Stage B must act on a context queried AFTER the classify call +
    // the inbound-record write, so it never decides (and never auto-attaches) on a pre-classify
    // snapshot that a concurrent mint/close could have staled. When parse-fed, the parser refs
    // widen the lookup so a document-only Case-ref/VRM can find its open case.
    const widenedRequest = buildWidenedTriageContextRequest(
      inbound,
      classification,
      parseFedOn ? input.parsed : {},
    );
    let resolvedContext: TriageContextResult;
    try {
      resolvedContext = await dataApi.triageContext(widenedRequest);
    } catch (e) {
      ctx.warn(
        `[triageUnified] context lookup failed for ${inbound.internetMessageId} — degrading to an empty context (best-effort, additive feature; never blocks intake): ${e instanceof Error ? e.message : String(e)}`,
      );
      resolvedContext = EMPTY_CONTEXT;
    }

    const { hasAttachments, attachmentKinds, imagesOnly } = deriveAttachmentSignals(inbound);
    // Inject the parsed ref/VRM into the classification (parse-fed only) so a document-only ref
    // reaches decideTriage's hasRefSignal — see toPolicyClassification's own doc.
    const policyClassification = toPolicyClassification(classification, parseFedOn ? input.parsed : {});
    const policyContext: TriagePolicyContext = {
      openCaseMatches: resolvedContext.openCaseMatches,
      duplicateInternetMessageId: resolvedContext.duplicateInternetMessageId,
      conversationSiblingCaseIds: resolvedContext.conversationSiblingCaseIds,
      providerMatchState: normaliseMatchState(matchState),
      hasAttachments,
      attachmentKinds,
      imagesOnly,
    };

    const actingGateValues = actingGates();
    const shadow = decideTriage(policyClassification, policyContext, GATES_ALL_ON);
    const acting_decision = decideTriage(policyClassification, policyContext, actingGateValues);

    const intermediaryDecisionInputs = input.intermediaryImageSourceId
      ? {
          intermediaryImageSourceId: input.intermediaryImageSourceId,
          intermediaryCandidateProviderIds: input.intermediaryCandidateProviderIds ?? [],
        }
      : {};

    await trackEvent('triage_decision', {
      actingAction: acting_decision.action,
      shadowAction: shadow.action,
      actingFinalCategory: acting_decision.finalCategory,
      actingFinalSubtype: acting_decision.finalSubtype,
      shadowFinalCategory: shadow.finalCategory,
      shadowFinalSubtype: shadow.finalSubtype,
      policyVersion: acting_decision.policyVersion,
      gatesSnapshot: actingGateValues,
      messageId: inbound.messageId,
      sourceMailbox: inbound.sourceMailbox,
      decisionInputs: { ...shadow.decisionInputs, ...intermediaryDecisionInputs },
      taxonomyVersion: classification.taxonomyVersion ?? 1,
      // PLAN-014 parse-fed telemetry for the Slice-5 live KQL spot-check:
      //  · parseFedGateOn — the TRIAGE_PARSE_FED_ENABLED gate value for this arrival.
      //  · parseFedApplied — whether a parse-fed signal ACTUALLY reached the classify call
      //    (open_case_ref_match resolved to one/ambiguous, OR ≥1 content typing), so the KQL can
      //    distinguish a genuinely parse-fed decision from a gate-on-but-empty legacy input
      //    (derived from the checkpointed outcome, NOT equated with the env gate).
      //  · openCaseRefMatch / parseFedContentTypingCount — the raw fed signals.
      parseFedGateOn: parseFedOn,
      parseFedApplied:
        parseFedOn && (openCaseRefMatch === 'one' || openCaseRefMatch === 'ambiguous' || contentTypings.length > 0),
      openCaseRefMatch,
      parseFedContentTypingCount: contentTypings.length,
    });

    if (
      acting_decision.action === 'suggest_attach' ||
      acting_decision.action === 'attach_case' ||
      acting_decision.action === 'propose_cancellation'
    ) {
      try {
        await dataApi.triageSuggestLink({
          sourceMessageId: inbound.internetMessageId,
          ...(acting_decision.targetCaseId ? { targetCaseId: acting_decision.targetCaseId } : {}),
          suggestionType:
            acting_decision.suggestionType ??
            (acting_decision.action === 'propose_cancellation' ? 'cancellation' : 'case_link'),
          rationale: acting_decision.rationale,
          ...(acting_decision.action === 'attach_case' ? { autoAttach: true } : {}),
          ...(policyClassification.confidence !== undefined ? { confidence: policyClassification.confidence } : {}),
          decisionInputs: { ...acting_decision.decisionInputs, ...intermediaryDecisionInputs },
        });
      } catch (e) {
        ctx.warn(
          `[triageUnified] suggestion write failed for ${inbound.internetMessageId} (best-effort, continuing): ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    ctx.log(
      JSON.stringify({
        evt: 'triageUnified',
        messageId: inbound.messageId,
        actingAction: acting_decision.action,
        shadowAction: shadow.action,
      }),
    );

    return { classification, decision: acting_decision, parseFedGateOn: parseFedOn };
  },
});
