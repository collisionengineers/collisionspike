/**
 * Durable intake pipeline. Activities are ordered, replay-safe, and idempotent:
 * fetch the message, classify and correlate it, parse instructions, resolve the
 * Case, persist evidence, maintain the Archive copy, evaluate readiness, and
 * enrich vehicle facts. Optional capabilities read their gates inside activities
 * so orchestration history remains deterministic.
 */

import * as df from 'durable-functions';
import type { OrchestrationContext, RetryOptions, Task } from 'durable-functions';
import { supplementClaimantNameFromBody } from '../../platform/supplement-parse.js';
import { buildParserEvaFields } from './parser-eva-fields.js';
import type { InboundClassification } from './classifyInbound.js';
import { shouldAttemptPdfVrmMatch } from '../evidence/imagesReceivedVrmMatch.js';
import { shouldLinkReplyToCase } from './reply-link-eligibility.js';
import { shouldAttemptTriageAssist } from './triage-classify.js';
import { decideCaseType, decideRetro, categoryMintsCase } from '@cs/domain';
import { vehicleDataIntakeIdempotencyKey } from '../../platform/vehicle-data-intake.js';
import { providerRecoveryAfterArchive } from './intake-decisions.js';
import { resolveCaseVrm, resolveCaseRef } from './case-identity.js';
// PLAN-014 Slice 4b — `orderParseCandidates` gates the hoisted parse; imported from the
// dependency-free parse-candidates.ts so the orchestrator's module graph never pulls parse.ts's
// activity registration / blob / OCR clients. AttachmentTyping + TriageUnifiedResult are
// type-only (erased at build — no runtime load of parse.ts / triageUnified.ts here).
import { orderParseCandidates, type ParseAttachment } from './parse-candidates.js';
import type { AttachmentTyping } from './parse.js';
import type { TriageUnifiedResult } from './triageUnified.js';

const retry = new df.RetryOptions(/*firstRetryIntervalInMilliseconds*/ 5_000, /*maxNumberOfAttempts*/ 3);
retry.backoffCoefficient = 2;
retry.maxRetryIntervalInMilliseconds = 60_000;

/**
 * Shared classifyPersist → extractImages → boxArchiveEvidence → statusEvaluate sequence run
 * by every lane that persists evidence onto a case (attach_case, linked-reply, receiving_work).
 * `yield*` delegation preserves the Durable replay order exactly — mirrors
 * retro-reconstruct.ts's `finishPersisted` (TKT-210). Returns the resolved status value;
 * callers append their own return shape / continuation (receiving_work continues into
 * `enrich`). `classifyPersistExtra`/`extractImagesExtra` are each call site's own
 * caseVrm/workProviderId/typings bag, computed exactly as before this extraction — this
 * helper never recomputes them, so each site's existing key-presence semantics are
 * preserved unchanged.
 */
export function* persistEvidenceAndArchive(
  ctx: OrchestrationContext,
  retry: RetryOptions,
  args: {
    caseId: string;
    inbound: unknown;
    principalCode?: string;
    classifyPersistExtra: Record<string, unknown>;
    extractImagesExtra: Record<string, unknown>;
    imageExtractionFailedMessage: string;
    archiveFailedMessage: string;
  },
): Generator<Task, string, never> {
  const {
    caseId,
    inbound,
    principalCode,
    classifyPersistExtra,
    extractImagesExtra,
    imageExtractionFailedMessage,
    archiveFailedMessage,
  } = args;
  yield ctx.df.callActivityWithRetry('classifyPersist', retry, {
    caseId,
    inbound,
    ...classifyPersistExtra,
  });
  try {
    yield ctx.df.callActivityWithRetry('extractImages', retry, {
      caseId,
      messageId: (inbound as { messageId?: string }).messageId,
      attachments: (inbound as { attachments?: unknown }).attachments,
      ...extractImagesExtra,
      // TKT-143 — resolved identity for the extraction filename stems (omit-when-unknown).
      ...(principalCode ? { providerPrincipal: principalCode } : {}),
    });
  } catch (e) {
    if (!ctx.df.isReplaying) {
      ctx.log(`${imageExtractionFailedMessage}: ${String(e)}`);
    }
  }
  try {
    yield ctx.df.callActivityWithRetry('boxArchiveEvidence', retry, { caseId });
  } catch (e) {
    if (!ctx.df.isReplaying) {
      ctx.log(`${archiveFailedMessage}: ${String(e)}`);
    }
  }
  const status = (yield ctx.df.callActivityWithRetry('statusEvaluate', retry, { caseId })) as {
    value: string;
  };
  return status.value;
}

/**
 * Shared decideRetro → refusal log → retry-wrapped retroCaseOrchestrator call, run by both
 * the reply lane (an unmatched reply) and the non-reply lane. The two call sites are
 * mutually exclusive per arrival (shouldLinkReplyToCase decides which one runs) — `yield*`
 * delegation preserves the Durable replay order exactly, mirroring the helper above.
 */
export function* runRetroFallback(
  ctx: OrchestrationContext,
  retry: RetryOptions,
  args: {
    inbound: unknown;
    classification: Pick<InboundClassification, 'category' | 'subtype' | 'bodyCaseref' | 'bodyJobref' | 'bodyVrm'>;
    workProviderId?: string;
    principalCode?: string;
    intermediaryImageSourceId?: string;
    intermediaryCandidateProviderIds?: string[];
    isReply: boolean;
    linkReplyOutcome?: 'linked' | 'ambiguous' | 'no_match';
    lane: 'reply' | 'non_reply';
    candidateRef?: string;
    candidateVrm?: string;
  },
): Generator<Task, string | undefined, never> {
  const claimant = supplementClaimantNameFromBody(
    String((args.inbound as { body?: string }).body ?? ''),
  );
  const retroDecision = decideRetro({
    category: args.classification.category,
    subtype: args.classification.subtype,
    bodyCaseref: args.classification.bodyCaseref,
    bodyJobref: args.classification.bodyJobref,
    bodyVrm: args.classification.bodyVrm,
    bodyClaimant: claimant.status === 'matched' ? claimant.value : '',
    candidateRef: args.candidateRef,
    candidateVrm: args.candidateVrm,
    isReply: args.isReply,
    ...(args.isReply ? { linkReplyOutcome: args.linkReplyOutcome } : {}),
  });
  // TKT-119: a refusal must not be a SILENT nothing — log the reasons so "why did retro
  // never run for this email" is answerable from telemetry.
  if (!retroDecision.attempt && !ctx.df.isReplaying) {
    ctx.log(
      JSON.stringify({
        evt: 'retroDecision',
        attempt: false,
        lane: args.lane,
        reasons: retroDecision.reasons,
      }),
    );
  }
  let retroOutcome: string | undefined;
  if (retroDecision.attempt) {
    try {
      const retro = (yield ctx.df.callSubOrchestratorWithRetry('retroCaseOrchestrator', retry, {
        trigger: args.inbound,
        category: args.classification.category,
        subtype: args.classification.subtype,
        keys: retroDecision.keys,
        providerId: args.workProviderId,
        providerPrincipal: args.principalCode,
        // TKT-219 — thread the sender's intermediary match so a reconstruction gets the
        // same content-corroboration / single-candidate fallback as a live create.
        ...(args.intermediaryImageSourceId
          ? {
              intermediary: {
                imageSourceId: args.intermediaryImageSourceId,
                candidateProviderIds: args.intermediaryCandidateProviderIds ?? [],
              },
            }
          : {}),
      })) as { outcome?: string };
      retroOutcome = retro?.outcome;
    } catch (e) {
      retroOutcome = 'error';
      if (!ctx.df.isReplaying) {
        ctx.log(`[intake] retro fallback failed (additive, non-blocking): ${String(e)}`);
      }
    }
  }
  return retroOutcome;
}

df.app.orchestration('intakeOrchestrator', function* (ctx): Generator<Task, unknown, never> {
  // `resource` (users/<mailbox>/…) is enqueued by graph-webhook so fetchMessage can derive the mailbox.
  const input = ctx.df.getInput() as { messageId: string; resource?: string; receivedAt?: string };

  // A0 — fetch message from Graph + land bytes in Blob; returns normalised inbound envelope
  const inbound: unknown = yield ctx.df.callActivityWithRetry('fetchMessage', retry, input);

  // 1 — provider-match (idempotent read; safe to retry)
  const provider: unknown = yield ctx.df.callActivityWithRetry('providerMatch', retry, inbound);
  const workProviderId = (provider as { workProviderId?: string }).workProviderId;
  const matchState = (provider as { matchState?: string }).matchState;
  const principalCode = (provider as { principalCode?: string }).principalCode;
  // rules-engine-v2 Phase 3 (ADR-0011) — set only when providerMatch resolved the sender to
  // an Image-Source intermediary (e.g. Connexus). Threaded into triagePolicy (decisionInputs
  // telemetry) and caseResolve (resolve-persist corroboration) below.
  const intermediaryImageSourceId = (provider as { imageSourceId?: string }).imageSourceId;
  const intermediaryCandidateProviderIds = (provider as { candidateProviderIds?: string[] })
    .candidateProviderIds;

  // 1.4 (PLAN-014 Slice 4b — parse-fed unified triage reorder) — parse the instruction
  // document(s) NOW, immediately after providerMatch and BEFORE triage, so the extracted PDF
  // VRM/reference + per-attachment content typings can feed the unified triage classify call
  // (D1 open_case_ref_match + D4 attachment_content_typings) and every downstream lane reads
  // ONE parse result. This repositioning is PERMANENT and is NOT gated by any TRIAGE_* flag —
  // TRIAGE_PARSE_FED_ENABLED (read INSIDE triageUnified) controls only whether the RESULT is
  // consumed, never whether parse runs. Gated here on "are there document candidates at all"
  // (orderParseCandidates — the SAME predicate parse.ts skips on) so a no-document email never
  // pays an activity round-trip that could only skip; parse.ts still reads PDF_MAPPER_ENABLED
  // and degrades internally.
  //
  // ACCEPTED COST (Slice 4b, named explicitly): (1) parser latency/cold-start now hits every
  // DOC-BEARING email, not just receiving_work — paired with the Slice 5 post-flip latency
  // watch; (2) a drop_duplicate arrival now pays this parse cost, because parse runs before
  // triage decides the arrival is a duplicate.
  //
  // BEST-EFFORT (resilience #95): parse.ts throws on a sustained 5xx/network outage AFTER its
  // retries are exhausted. A throw here would sink the whole orchestration → NO Case is ever
  // minted (a regression), so the call is wrapped: on total parser failure we log once
  // (guarded by !isReplaying) and continue with an EMPTY parse result so case-create still
  // proceeds on the email-sniff VRM.
  let parseResult: {
    vrm?: { value?: string };
    reference?: { value?: string };
    extraction?: Record<string, { value?: string } | undefined>;
    // The instructing provider resolved across ALL parsed docs (parse.ts
    // resolveWorkProviderAcrossDocs) — preferred over the chosen envelope's extraction so an
    // audit email's PCH/QDOS provider survives when the EVA report is the selected envelope.
    resolvedWorkProvider?: string;
    attachmentTypings?: AttachmentTyping[];
    skipped?: boolean;
  } = {};
  const hasDocCandidates =
    orderParseCandidates((inbound as { attachments?: ParseAttachment[] }).attachments ?? []).length > 0;
  if (hasDocCandidates) {
    try {
      parseResult = (yield ctx.df.callActivityWithRetry('parse', retry, {
        messageId: (inbound as { messageId?: string }).messageId,
        attachments: (inbound as { attachments?: unknown }).attachments,
        providerHint: principalCode,
      })) as typeof parseResult;
    } catch (e) {
      if (!ctx.df.isReplaying) {
        ctx.log(
          `[intake] parse failed after retries (parser outage) — proceeding with empty parse result so case-create still runs: ${String(e)}`,
        );
      }
    }
  }
  // Only the fields the parse-fed classify call (D1/D4) and the pre-triage lanes actually
  // need are derived HERE. Mileage / parser-EVA fields / the claimant-conflict telemetry are
  // receiving_work-ONLY, so they stay in that lane (computed from this same `parseResult`) —
  // hoisting parse must NOT broaden their scope (or their telemetry) to non-minting doc-bearing
  // mail that never reaches the receiving_work lane.
  const parserVrm = (parseResult.vrm?.value ?? '').trim();
  // #100 — a provider reference appearing ONLY in the instruction PDF (not the email subject/
  // body) must still feed the ADR-0010 Case/PO-first dedup ladder AND persist as case_ref.
  const parserRef = (parseResult.reference?.value ?? '').trim();
  // D4 — per-attachment content typings mapped to the {filename, docType} wire shape, fed to
  // triageUnified for the parse-fed classify call; [] when parse was skipped / typed nothing.
  const parserContentTypings = (parseResult.attachmentTypings ?? []).map((t) => ({
    filename: t.filename,
    docType: t.docType,
  }));

  // 1.5 (PLAN-014 Slice 4b) — UNIFIED triage: ONE activity composing Stage A (classify) +
  // Stage B (triage policy), replacing the former two-call classifyInbound + triagePolicy
  // sequence in the INTAKE path. Fed the hoisted parse result so the classify call itself can
  // see open_case_ref_match (D1) + attachment_content_typings (D4) — but ONLY when
  // TRIAGE_PARSE_FED_ENABLED is on, decided INSIDE the activity (never here — an orchestrator
  // must not read process.env).
  //
  // The old `triagePolicy` activity now has NO remaining caller and is dead-but-registered
  // (removable one release after the flip). The old `classifyInbound` activity is NOT dead —
  // retroCaseOrchestrator (retro-case.ts) still calls it independently — so it stays live and
  // must NOT be removed; only the intake path stopped using it.
  //
  // DEPLOY SAFETY (operational, not a code invariant): this reorder changes the yielded
  // activity SEQUENCE, so an intake instance recorded against the OLD generator will NOT replay
  // cleanly against this one (Durable matches history positionally) — keeping the old
  // activities registered does NOT rescue it. Slice 5 therefore DRAINS in-flight intake
  // instances before/at deploy; that drain, not registration, is what makes the deploy safe.
  //
  // KILL-SWITCH INVARIANT (rewritten for Slice 4b — it is about VALUES + the gate, NOT code
  // position, which the parse hoist deliberately changed): with TRIAGE_PARSE_FED_ENABLED off,
  // triageUnified's classify request and both context lookups are byte-identical to the old
  // classifyInbound + triagePolicy pair (proven by triageUnified.ts's gate-off parity tests),
  // and with every TRIAGE_*_ENABLED routing gate absent `acting` is still 'proceed_default'
  // (decideTriage's own construction). Parse now runs ABOVE this call unconditionally for
  // doc-bearing mail — that repositioning is permanent and is NOT reverted by any gate being
  // off; only the CONSUMPTION of the parse result (here via `parsed`, and in the lanes below
  // via `parseFedGateOn`) is gated, so a gate-off deploy is decision- AND lane-identical to
  // pre-Slice-4b behaviour.
  const triageResult = (yield ctx.df.callActivityWithRetry('triageUnified', retry, {
    inbound,
    workProviderId,
    matchState,
    parsed: { parserVrm, parserRef, attachmentTypings: parserContentTypings },
    ...(intermediaryImageSourceId
      ? { intermediaryImageSourceId, intermediaryCandidateProviderIds }
      : {}),
  })) as TriageUnifiedResult;
  const classification = triageResult.classification;
  const triage = triageResult.decision;
  // Lanes that did NOT previously have a parse result in scope (attach_case evidence VRM,
  // route_images_unmatched VRM, reply-link ref/VRM) may use the hoisted parser VRM/ref ONLY
  // when this arrival was actually parse-fed — a CHECKPOINTED activity value, so the
  // orchestrator never reads process.env. Off → undefined → those lanes fall back to
  // candidate/body exactly as today (byte-identical). The receiving_work lane and the TKT-102
  // rung already consumed a parse result pre-Slice-4b, so they use parserVrm/parserRef UNGATED
  // (behaviour-preserving).
  const laneParserVrm = triageResult.parseFedGateOn ? parserVrm : undefined;
  const laneParserRef = triageResult.parseFedGateOn ? parserRef : undefined;

  if (triage.action !== 'proceed_default' && !ctx.df.isReplaying) {
    ctx.log(
      `[intake] triage policy: ${triage.action} on ${classification.category}/${classification.subtype}` +
        (triage.targetCaseId ? ` -> case ${triage.targetCaseId}` : ''),
    );
  }

  // drop_duplicate (TRIAGE_REF_GATE_ENABLED only) — this exact Internet-Message-Id was
  // already ingested, typically the SAME email delivered to two subscribed mailboxes
  // (ADR-0019's "mint race"). The inbound_email triage row is already recorded
  // (step 1.5, unconditional) and classifyInbound's own audit call already covers this
  // arrival, so there is nothing left to persist for a message that will never own a
  // case — skip linkReply/parse/caseResolve/boxFolder AND classifyPersist/extractImages/
  // boxArchive/statusEvaluate (evidence.case_id is NOT NULL: there is no case to attach
  // it to), mirroring the existing linked-reply lane's "no new case minted" return shape
  // below (a plain descriptive result, no further activity calls).
  if (triage.action === 'drop_duplicate') {
    return { triaged: classification.category, subtype: classification.subtype, triage: triage.action };
  }

  // attach_case (TKT-093 auto-attach, LIVE via TRIAGE_AUTO_ATTACH_ENABLED) — decideTriage
  // resolved an EXACT single open-case match on a STRONG signal (case_po/job_ref, never VRM)
  // and the triagePolicy activity has ALREADY self-accepted the reversible `inbound_linked`
  // attach onto triage.targetCaseId. This email therefore BELONGS to that existing case and
  // must NOT ALSO mint a new one: the receiving_work fall-through below routes on
  // classification.category (Stage A's own label), NOT triage.finalCategory, so without this
  // branch a work-shaped follow-up on an open case (the TKT-043 shape) would auto-attach AND
  // mint a DUPLICATE — violating the ticket acceptance "no new case is minted" (PR#45 review,
  // Finding B). Persist its email/attachments/images as evidence on the matched case + archive
  // + re-evaluate status — the linked-reply lane's non-minting shape below — then return.
  // Replay-safe: branches only on checkpointed triage values, never on process.env.
  if (triage.action === 'attach_case' && triage.targetCaseId) {
    const caseId = triage.targetCaseId;
    // Slice 4b — prefer the hoisted PDF VRM for the evidence stamp when parse-fed (more
    // accurate case-VRM on evidence than the email sniff); undefined when gate-off → identical
    // to today. This stamps evidence only; the attach DECISION already happened in triage.
    const caseVrm = resolveCaseVrm({
      parserVrm: laneParserVrm,
      candidateVrm: (inbound as { candidateVrm?: string }).candidateVrm,
      bodyVrm: classification.bodyVrm,
    });
    const evidenceExtra = {
      ...(caseVrm ? { caseVrm } : {}),
      ...(workProviderId ? { workProviderId } : {}),
    };
    const statusValue = yield* persistEvidenceAndArchive(ctx, retry, {
      caseId,
      inbound,
      principalCode,
      classifyPersistExtra: evidenceExtra,
      extractImagesExtra: evidenceExtra,
      imageExtractionFailedMessage: `[intake] image extraction failed for attach_case ${caseId} (additive, non-blocking)`,
      archiveFailedMessage: `[intake] archive failed for attach_case ${caseId} (additive, non-blocking)`,
    });
    return {
      triaged: triage.finalCategory,
      subtype: triage.finalSubtype,
      attach: triage.action,
      caseId,
      status: statusValue,
    };
  }

  // 1.55b — gated LLM triage-assist (Stage C, ADR-0019 / rules-engine-v2 Phase 4): a
  // best-effort SECOND OPINION for rows Stage A could not confidently place (abstain, or
  // carrying an uncorroborated_* signal flag — see shouldAttemptTriageAssist's own doc for
  // why that is checked independently of category/action, not just "category === other").
  // Writes a SUGGESTION only (triage-classify.ts's activity), never changes routing below
  // — the branches that follow keep deciding purely on Stage A/B's classification/action,
  // exactly as before this block existed.
  //
  // DURABLE DETERMINISM: shouldAttemptTriageAssist reads ONLY the checkpointed
  // `classification` value (Stage A's result from step 1.5, already replay-safe) — it
  // NEVER reads process.env, so this `if` is safe to re-evaluate identically on every
  // replay. The real EMAIL_AI_ENABLED/model-configured gate is NOT checked here (an
  // orchestrator body must never branch on process.env — Azure can replay this generator
  // on a different worker/at a different time, and env state is not guaranteed identical);
  // it lives INSIDE the triageClassify ACTIVITY instead, which already returns
  // `{ skipped: true }` immediately when off. Net effect: with the gate off, this branch
  // still SCHEDULES an activity call for the qualifying subset of rows (abstain/
  // uncorroborated only — not "every email"), but that call is a cheap no-op round trip,
  // never a model call. Placed AFTER the drop_duplicate return so a cross-mailbox repeat
  // delivery is never sent for a second opinion it will just be discarded alongside.
  if (shouldAttemptTriageAssist(classification)) {
    try {
      const env = inbound as {
        internetMessageId?: string;
        subject?: string;
        body?: string;
        senderAddress?: string;
        attachments?: Array<{ filename: string }>;
      };
      yield ctx.df.callActivityWithRetry('triageClassify', retry, {
        sourceMessageId: env.internetMessageId,
        subject: env.subject,
        body: env.body,
        senderAddress: env.senderAddress,
        // The provider matched in step 1 — lets the activity honour a per-provider AI opt-out
        // (`work_provider.ai_allowed`; see docs/operations/operator-actions.md) without
        // re-resolving. Undefined when the
        // sender matched no provider (nothing to opt out of).
        ...(workProviderId ? { workProviderId } : {}),
        attachmentFilenames: (env.attachments ?? []).map((a) => a.filename),
        deterministicCategory: classification.category,
        deterministicSubtype: classification.subtype,
        deterministicSignals: classification.signals,
      });
    } catch (e) {
      if (!ctx.df.isReplaying) {
        ctx.log(`[intake] triage LLM assist failed (additive, suggestion-only, non-blocking): ${String(e)}`);
      }
    }
  }

  // suggest_attach / propose_cancellation: the DECISION (and the best-effort
  // ai_suggestion write) already happened INSIDE the triagePolicy activity. NEITHER
  // changes ROUTING this release (ADR-0019 §4's suggest-first promotion ladder —
  // promoting a decision to an automatic action is a DOCUMENTED FUTURE SEAM):
  //   - suggest_attach: a receiving_work email still mints its own case exactly as today
  //     (the flow below branches on classification.category, Stage A's own label — NEVER
  //     on triage.finalCategory); staff act on the suggestion from the inbox. VRM-only
  //     matches NEVER promote past suggestion (ADR-0010) — permanently, not a release-1
  //     caveat.
  //   - propose_cancellation: category 'cancellation' is already !== 'receiving_work', so
  //     the branch below already routes it via the linkReply/query lane unchanged; this
  //     action never auto-closes or auto-holds a case.
  //
  // route_images_unmatched (TKT-034 — the ADR-0015 §5 fallback, now built): an
  // image-bearing email that matched no case gets a VISIBLE flag for manual handling
  // (attention_reason 'images_no_match' on its triage row — the SPA renders the
  // plain-English chip while the row is unlinked), plus the DARK reg-keyed Box
  // holding-folder rung (BOX_REG_FOLDER_ENABLED, default off — gate read INSIDE the
  // activity). Additive + best-effort: routing below is unchanged, and the lane's
  // linkReply may still link the email (a later link supersedes the chip
  // presentation-side).
  if (triage.action === 'route_images_unmatched') {
    try {
      yield ctx.df.callActivityWithRetry('imagesUnmatched', retry, {
        internetMessageId: (inbound as { internetMessageId?: string }).internetMessageId,
        // Slice 4b — a mixed image+PDF email can now flag with the PDF-extracted VRM when
        // parse-fed; undefined when gate-off → candidate/body only, exactly as today.
        vrm: resolveCaseVrm({
          parserVrm: laneParserVrm,
          candidateVrm: (inbound as { candidateVrm?: string }).candidateVrm,
          bodyVrm: classification.bodyVrm,
        }),
        attachments: (inbound as { attachments?: unknown }).attachments,
        claimToken: ctx.df.newGuid('images-unmatched-body'),
      });
    } catch (e) {
      if (!ctx.df.isReplaying) {
        ctx.log(`[intake] images-unmatched flag failed (additive, non-blocking): ${String(e)}`);
      }
    }
  }

  // QUERY / OTHER / NON_ACTIONABLE / CANCELLATION / CASE_UPDATE never mint a Case — the
  // inbound_email triage row IS the record. Only `receiving_work` mints (categoryMintsCase,
  // @cs/domain — an explicit, unit-tested invariant so a non_actionable acknowledgement can
  // never open a blank Case: TKT-081 s2). BUT a REPLY about existing work (#3) links/appends
  // to its OPEN case (Case-ref first, then VRM; >1 → Held, never auto-link — the DB lookup +
  // ADR-0010 decision run in the Data API). When a reply links to a case, still run the
  // record-keeping path so its email/attachments/images are evidence and can be mirrored
  // into the archive.
  if (!categoryMintsCase(classification.category)) {
    if (shouldLinkReplyToCase(classification)) {
      const inb = inbound as { candidateRef?: string; candidateVrm?: string };
      // Slice 4b — a reply whose Case-ref/VRM lives ONLY inside an attached PDF (not the
      // subject/body) can now link, because parserRef/parserVrm are in scope before this lane
      // for the first time. Gated on parse-fed via laneParserRef/laneParserVrm: undefined when
      // off → candidate/body only, byte-identical to today.
      const ref = resolveCaseRef({ parserRef: laneParserRef, candidateRef: inb.candidateRef, bodyCaseref: classification.bodyCaseref });
      const vrm = resolveCaseVrm({ parserVrm: laneParserVrm, candidateVrm: inb.candidateVrm, bodyVrm: classification.bodyVrm });
      // rules-engine-v2 Phase 2 / TKT-023 — widen the match beyond Case/PO+VRM with the
      // engine's job-ref signal (capture-only field #2 alongside recordInboundEmail's
      // bodyJobref/conversationId — see data-api.ts): a follow-up bearing only e.g. "Our
      // ref: 576299" can now attach via THIS existing (ungated) reply-link lane too.
      const jobref = (classification.bodyJobref ?? '').trim();
      const link = (yield ctx.df.callActivityWithRetry('linkReply', retry, {
        inbound,
        providerId: workProviderId,
        ref,
        vrm,
        jobref,
      })) as { outcome: string; caseId?: string };
      if (link.outcome === 'linked' && link.caseId) {
        const evidenceExtra = {
          caseVrm: vrm || (inbound as { candidateVrm?: string }).candidateVrm,
          ...(workProviderId ? { workProviderId } : {}),
        };
        const statusValue = yield* persistEvidenceAndArchive(ctx, retry, {
          caseId: link.caseId,
          inbound,
          principalCode,
          classifyPersistExtra: evidenceExtra,
          extractImagesExtra: evidenceExtra,
          imageExtractionFailedMessage: `[intake] image extraction failed for linked reply case ${link.caseId} (additive, non-blocking)`,
          archiveFailedMessage: `[intake] archive failed for linked reply case ${link.caseId} (additive, non-blocking)`,
        });
        return {
          triaged: classification.category,
          subtype: classification.subtype,
          replyLink: link.outcome,
          caseId: link.caseId,
          status: statusValue,
        };
      }
      // Retro fallback (ADR-0022, ADDITIVE + LAST in this lane): an unmatched reply about a
      // case the system has never seen may be linkable/reconstructable from the archive.
      // decideRetro is pure over checkpointed values (the decideCaseType convention —
      // replay-safe, no env reads); `ambiguous` never fires it (≥2 open cases already
      // match). The sub-orchestration is try/catch-wrapped + gated inside its activities,
      // so the primary return below is never blocked or changed — `retro` is an added key.
      // TKT-219 — claimant name (weakest search key), pure over the checkpointed body.
      // Only an unambiguous 'matched' supplement may become a key (never guess a conflict).
      const retroReplyOutcome = yield* runRetroFallback(ctx, retry, {
        inbound,
        classification,
        workProviderId,
        principalCode,
        intermediaryImageSourceId,
        intermediaryCandidateProviderIds,
        isReply: true,
        linkReplyOutcome: link.outcome as 'linked' | 'ambiguous' | 'no_match',
        lane: 'reply',
        candidateRef: inb.candidateRef,
        candidateVrm: inb.candidateVrm,
      });
      return {
        triaged: classification.category,
        subtype: classification.subtype,
        replyLink: link.outcome,
        ...(link.caseId ? { caseId: link.caseId } : {}),
        ...(retroReplyOutcome ? { retro: retroReplyOutcome } : {}),
      };
    }

    // TKT-102 — image-delivery emails whose match key lives INSIDE the attached PDF (the
    // Tractable "New completed lead…" shape: subject/body carry NO registration or
    // reference — the PDF's Vehicle Information block does). Runs ONLY when the
    // subject/body machinery found no case (pure predicate over CHECKPOINTED values —
    // never env): re-use the EXISTING `parse` activity over the attachment(s) (gated
    // PDF_MAPPER_ENABLED inside, exactly like step 4), then feed the PDF-extracted
    // registration into the existing match machinery — an exact-single open-case VRM
    // match becomes the same case_link SUGGESTION the ref-gate rung writes (VRM-only
    // NEVER auto-attaches, ADR-0010); none/several becomes the existing TKT-034 visible
    // flag. Additive + best-effort: no case is minted here and a failure never blocks
    // the return below.
    let pdfVrmMatch: string | undefined;
    if (
      shouldAttemptPdfVrmMatch(
        classification,
        triage,
        (inbound as { attachments?: Array<{ filename?: string; contentType?: string }> })
          .attachments,
      )
    ) {
      // Slice 4b (TKT-102 collapse) — the dedicated inline `parse` call this lane used to make
      // is GONE: parse now runs once, hoisted above triage, so this rung reads the SAME hoisted
      // `parserVrm` instead of parsing the PDF a second time (which, across retries, could even
      // fetch two disagreeing results). Ungated / parse-fed-independent: this lane already
      // consumed a PDF parse before Slice 4b, so its behaviour is preserved, not newly enabled.
      // `triedVrm` stays candidate||body WITHOUT parserVrm — it means "what the subject/body
      // machinery already tried and failed on", never "the best current guess".
      try {
        const vrmMatch = (yield ctx.df.callActivityWithRetry('imagesReceivedVrmMatch', retry, {
          internetMessageId: (inbound as { internetMessageId?: string }).internetMessageId,
          vrm: parserVrm,
          triedVrm:
            ((inbound as { candidateVrm?: string }).candidateVrm || classification.bodyVrm || '').trim(),
        })) as { outcome: string };
        pdfVrmMatch = vrmMatch.outcome;
        if (parserVrm && ['flagged:no_open_case', 'flagged:multiple_open_cases'].includes(vrmMatch.outcome)) {
          yield ctx.df.callActivityWithRetry('imagesUnmatched', retry, {
            internetMessageId: (inbound as { internetMessageId?: string }).internetMessageId,
            vrm: parserVrm,
            attachments: (inbound as { attachments?: unknown }).attachments,
            claimToken: ctx.df.newGuid('images-unmatched-pdf'),
          });
        }
      } catch (e) {
        if (!ctx.df.isReplaying) {
          ctx.log(
            `[intake] images-received VRM match failed (additive, non-blocking): ${String(e)}`,
          );
        }
      }
    }

    // Retro fallback (ADR-0022) for the NON-reply lane — today these return without any
    // linking attempt at all, which is exactly the billing-email gap. Same conventions as
    // the reply-lane block above (pure decideRetro, gated activities, additive, last).
    const inbNonReply = inbound as { candidateRef?: string; candidateVrm?: string };
    // TKT-219 — claimant name (weakest search key), pure over the checkpointed body.
    // Only an unambiguous 'matched' supplement may become a key (never guess a conflict).
    // TKT-119: a refusal must not be a SILENT nothing (see the reply-lane twin above).
    const retroOutcome = yield* runRetroFallback(ctx, retry, {
      inbound,
      classification,
      workProviderId,
      principalCode,
      intermediaryImageSourceId,
      intermediaryCandidateProviderIds,
      isReply: false,
      lane: 'non_reply',
      candidateRef: inbNonReply.candidateRef,
      candidateVrm: inbNonReply.candidateVrm,
    });
    return {
      triaged: classification.category,
      subtype: classification.subtype,
      ...(pdfVrmMatch ? { pdfVrmMatch } : {}),
      ...(retroOutcome ? { retro: retroOutcome } : {}),
    };
  }

  // RECEIVING WORK → carry the body-derived Case/PO into the dedup ladder (Case/PO-first,
  // VRM fallback — ADR-0015 §5) when the subject hadn't already yielded one.
  const inboundForCase = {
    ...(inbound as Record<string, unknown>),
    candidateRef: resolveCaseRef({
      candidateRef: (inbound as { candidateRef?: string }).candidateRef,
      bodyCaseref: classification.bodyCaseref,
    }),
  };

  // 4 — parse already ran (hoisted above triage in Slice 4b); `parseResult`/`parserVrm`/
  // `parserRef` are in scope. The remaining parser-derived fields are receiving_work-ONLY
  // (mileage → caseResolve/enrich; parser-EVA fields + claimant-conflict telemetry →
  // caseResolve), so they are derived HERE from the same `parseResult` rather than in the hoist
  // — keeping their scope (and the claimant-conflict telemetry) exactly as pre-Slice-4b, since
  // a non-minting doc-bearing email never reaches this lane.
  const documentHasMileage = Boolean(parseResult.extraction?.mileage?.value);
  // #107 — the document is authoritative for mileage (ADR-0006): when the parser extracted a
  // value, persist it fill-if-empty so the suppressed MOT estimate is not a silent data loss.
  const parserMileage = (parseResult.extraction?.mileage?.value ?? '').trim();
  const parserMileageUnit = (parseResult.extraction?.mileage_unit?.value ?? '').trim();
  // Forward every parser-owned EVA field (incl. body-supplemented claimant name / accident
  // circumstances) into the resolve-persist fill-if-empty write. Pure over the checkpointed
  // envelope + inbound, so it stays replay-safe; see parser-eva-fields.ts.
  const { parserEvaFields, claimantConflictCount } = buildParserEvaFields(
    parseResult,
    inbound as { body?: string; internetMessageId?: string; messageId?: string },
  );
  if (claimantConflictCount > 0 && !ctx.df.isReplaying) {
    ctx.log(
      JSON.stringify({
        evt: 'claimant-body-conflict',
        messageId: (inbound as { messageId?: string }).messageId,
        candidateCount: claimantConflictCount,
      }),
    );
  }

  // Case-type decision (ADR-0021) — pure + deterministic over the two CHECKPOINTED
  // activity results (parse envelope + Stage-A classification), so it is replay-safe
  // in the orchestrator body. The parser's document case_type is primary; the
  // classifier subtype is fallback/corroboration. APPLYING the
  // decision (case_type_code write + marker mint) is gated by AUDIT_CASES_ENABLED
  // INSIDE the Data API — forwarding is unconditional (shadow rollout: gate off, the
  // API records an observe-only audit_event and mints/types exactly as today).
  const caseTypeDecision = decideCaseType({
    parserCaseType: (parseResult as {
      case_type?: { value?: string | null; dual?: boolean; signals?: string[] };
    }).case_type,
    parserAudit: (parseResult as {
      audit?: { value?: boolean; signals?: string[] };
    }).audit,
    classifierSubtype: classification.subtype,
  });

  // 2 — case-resolve (UNIQUE(sourcemessageid) backstop makes upsert idempotent). The parser
  // VRM is preferred over the email sniff for dedup scoping AND the persisted case VRM (#7);
  // a known provider mints the Case/PO, a new client (no provider) routes to Held (#11).
  const resolved = (yield ctx.df.callActivityWithRetry('caseResolve', retry, {
    inbound: inboundForCase,
    providerId: workProviderId,
    matchState,
    parserVrm,
    parserRef,
    parserMileage,
    parserMileageUnit,
    parserEvaFields,
    caseType: caseTypeDecision.caseType,
    caseTypeDual: caseTypeDecision.dual,
    caseTypeSignals: [...caseTypeDecision.signals],
    // rules-engine-v2 Phase 3 (ADR-0011) — forwarded so the API's applyParserFields can
    // corroborate a content-detected provider against the intermediary's N:N candidates.
    ...(intermediaryImageSourceId
      ? { intermediaryImageSourceId, intermediaryCandidateProviderIds }
      : {}),
  })) as {
    outcome: string;
    caseId: string;
    casePo?: string | null;
    providerAutomationMode?: 'manual' | 'review_auto' | 'full_auto';
    providerRecovery?: 'identity_ready' | 'not_needed' | 'blocked';
  };

  if (resolved.outcome === 'already_ingested') {
    // Repairable source-message owners return `replayed` from caseResolve and continue
    // through the normal idempotent downstream chain. `already_ingested` is now reserved
    // for terminal exact owners or ownerless payload duplicates, so it must be a strict
    // no-mutation stop: no Archive ensure, evidence, enrichment, or status work.
    return { skipped: true, caseId: resolved.caseId };
  }

  // TKT-119 — the API's belt-and-braces mint guard refused the create (the message's own
  // triage row carries a never-minting category, e.g. an acknowledgement). The triage row
  // is already recorded (step 1.5); nothing further to persist for a message that will
  // never own a case.
  if (resolved.outcome === 'refused_category') {
    if (!ctx.df.isReplaying) {
      ctx.log(`[intake] case create refused by the category mint guard (${classification.category}/${classification.subtype})`);
    }
    return { triaged: classification.category, subtype: classification.subtype, refused: 'category_mint_guard' };
  }

  // 2.1 — mark the case as ingested (picked up by the intake pipeline); sets status
  // new_email → ingested so staff see "Logged" instead of "New email" during processing.
  // statusEvaluate (step 5) will compute the final review state.
  yield ctx.df.callActivityWithRetry('setIngested', retry, { caseId: resolved.caseId });

  // 2.2 — pre-instruction correlation (TKT-084, taxonomy v3). Directions the sender gave
  // BEFORE this instruction arrived are held as pre_instruction inbound rows (no case);
  // now that the case exists, raise a suggest-first case_link per matching held row so
  // the directions surface on this case. The TRIAGE_PRE_INSTRUCTION_ENABLED gate lives
  // INSIDE the activity (orchestrator determinism); best-effort — a correlation failure
  // must never block intake.
  try {
    yield ctx.df.callActivityWithRetry('correlatePreInstruction', retry, {
      caseId: resolved.caseId,
      casePo: resolved.casePo ?? null,
      vrm: resolveCaseVrm({ parserVrm, candidateVrm: (inbound as { candidateVrm?: string }).candidateVrm }),
      caseRef: resolved.casePo ?? '',
      jobRef: parserRef || classification.bodyJobref || '',
    });
  } catch (e) {
    if (!ctx.df.isReplaying) {
      ctx.log(`[intake] pre-instruction correlation failed for case ${resolved.caseId} (additive, non-blocking): ${String(e)}`);
    }
  }

  // Automation-mode branch (am ticket). RECONCILED (work-todo-spike "Both", 2026-06-30):
  // Box folder-create + evidence-archive + image-extraction are RECORD-KEEPING and now run
  // for ANY known-provider case (case_po present) REGARDLESS of mode — they were the cause of
  // "folders not getting made / box sync not working" when every provider resolved to manual.
  // Vehicle detail lookup is record completion and runs for every provider mode;
  // only reserved submission/dispatch steps are gated by automation mode:
  //   • manual      — record + classify + persist evidence + Box folder + Box archive + image
  //                   extraction and vehicle lookup, but no submission.
  //   • review_auto — the default live path: the same record completion, still
  //                   stopping short of EVA submission (always a staff action).
  //   • full_auto   — RESERVED. Behaves EXACTLY as review_auto today; its aggressive steps
  //                   (auto-EVA, auto-chaser, …) stay behind a default-off flag (FULL_AUTO_ENABLED)
  //                   and are intentionally NOT enabled here (ADR-0015 / am research §full).
  const automationMode = resolved.providerAutomationMode ?? 'review_auto';

  // 2.5 — Box folder at intake (#6, ADR-0012: additive one-way mirror). Every resolved Case id
  // is offered to the idempotent activity. It reads the saved Case/PO from the Data API and
  // skips a new client that still has no Case/PO, so a caller can neither choose a folder name
  // nor suppress recovery because an earlier response omitted casePo. The BOX_API_ENABLED +
  // BOX_FOLDER_AT_INTAKE_ENABLED gates AND the box_folder_id idempotency check live INSIDE the
  // boxFolderCreate activity —
  // an orchestrator must stay deterministic across replays, so it never reads env gates itself
  // (the parse/enrich/chaser convention; the recorded activity result is what replays). The
  // mirror is additive: a Box failure must NOT block the core intake (evidence/status/enrich),
  // so it is best-effort here — the manual box-folder-create starter can retry.
  // Runs for ANY case id regardless of mode (work-todo-spike "Both"); no-PO cases skip inside
  // (gating on resolved.casePo here would wrongly suppress recovery when an earlier response
  // omitted the Case/PO — the activity re-reads the saved Case/PO from the Data API instead).
  // Registration-folder ADOPTION is deliberately NOT decided inline with the mint: the recovery
  // monitor observes the candidate set, waits through a settling window, then re-reads it under
  // the same VRM mint lock, so two concurrent instructions can't have one win by committing first.
  let archiveFolderResult: unknown;
  let archiveFolderFailed = false;
  if (resolved.caseId) {
    try {
      archiveFolderResult = yield ctx.df.callSubOrchestratorWithRetry('boxFolderCreateOrchestrator', retry, {
        caseId: resolved.caseId,
      });
    } catch (e) {
      archiveFolderFailed = true;
      if (!ctx.df.isReplaying) {
        ctx.log(`[intake] box folder create failed for case ${resolved.caseId} (additive, non-blocking): ${String(e)}`);
      }
      if (resolved.providerRecovery === 'identity_ready') throw e;
    }
  }
  const providerRecovery = providerRecoveryAfterArchive(
    resolved.providerRecovery,
    archiveFolderResult,
    archiveFolderFailed,
  );
  if (resolved.providerRecovery === 'identity_ready' && providerRecovery !== 'completed') {
    throw new Error(
      `Provider identity is ready but the Archive folder is still pending for case ${resolved.caseId}`,
    );
  }

  // 3 (classifyPersist) / 3.5 (extractImages) / 3.6 (boxArchiveEvidence) / 5 (statusEvaluate):
  // the shared evidence-persistence sequence (see persistEvidenceAndArchive's doc above).
  // classifyPersist runs always (recording evidence is not "advancing"); extractImages
  // persists embedded PDF/EML images as evidence rows (RECORD-KEEPING — runs regardless of
  // automation mode, work-todo-spike "Both"); boxArchiveEvidence mirrors everything into the
  // case Box folder once all evidence generation is done; statusEvaluate recomputes
  // EVA-readiness. attachmentTypings (parse activity, ADR-0014/ADR-0021) lets a report-typed
  // attachment persist as engineer_report evidence.
  const receivingWorkEvidenceExtra = {
    caseVrm: resolveCaseVrm({ parserVrm, candidateVrm: (inbound as { candidateVrm?: string }).candidateVrm }),
    ...(workProviderId ? { workProviderId } : {}),
  };
  const statusValue = yield* persistEvidenceAndArchive(ctx, retry, {
    caseId: resolved.caseId,
    inbound,
    principalCode,
    classifyPersistExtra: {
      typings: (parseResult as { attachmentTypings?: unknown }).attachmentTypings,
      ...receivingWorkEvidenceExtra,
    },
    extractImagesExtra: receivingWorkEvidenceExtra,
    imageExtractionFailedMessage: `[intake] image extraction failed for case ${resolved.caseId} (additive, non-blocking)`,
    archiveFailedMessage: `[intake] box archive failed for case ${resolved.caseId} (additive, non-blocking)`,
  });

  // 6 — enrich (gate ENRICHMENT_ENABLED checked inside; no-op when off). Pass the best VRM
  // (parser PDF VRM preferred over the email sniff) + whether the doc already had mileage;
  // the activity persists the advisory result and recomputes readiness. This is
  // record completion, so `manual` providers are not silently skipped.
  try {
    yield ctx.df.callActivityWithRetry('enrich', retry, {
      caseId: resolved.caseId,
      vrm: resolveCaseVrm({ parserVrm, candidateVrm: (inbound as { candidateVrm?: string }).candidateVrm }),
      documentHasMileage,
      // Durable replays/retries of this intake instance must resolve to one
      // immutable lookup run and one audit/provenance write. Graph-backed
      // instance ids are hashed because the Data API key is deliberately bounded.
      idempotencyKey: vehicleDataIntakeIdempotencyKey(ctx.df.instanceId, resolved.caseId),
    });
  } catch (error) {
    // Vehicle completion is advisory. Transient transport faults receive the
    // normal Durable retry window, but exhausting it must not abort an intake
    // whose case and evidence have already been committed.
    if (!ctx.df.isReplaying) {
      ctx.error(`[intake] vehicle details unavailable for case ${resolved.caseId} (non-blocking): ${String(error)}`);
    }
  }

  return {
    caseId: resolved.caseId,
    status: statusValue,
    mode: automationMode,
    providerRecovery,
  };
});
