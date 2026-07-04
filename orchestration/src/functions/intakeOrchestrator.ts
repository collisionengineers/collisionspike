/**
 * orchestration/src/functions/intakeOrchestrator.ts
 *
 * Durable orchestrator: the intake pipeline (replaces the 7 live Power Automate flows).
 * Plan 22 §B — function-chaining pattern.
 *
 * Chain (activities run in order; each is at-least-once / must be idempotent):
 *   A0.  fetchMessage    → Graph: GET message + attachments + reply headers; land bytes → Blob
 *   1.   providerMatch   → Data API: match sender domain → work-provider
 *   1.5  classifyInbound → parser /classify-email: receiving_work vs query/other (+ is_reply)
 *   1.55 triagePolicy    → Data API (context read) + @cs/domain decideTriage (Stage B,
 *                          ADR-0019 / rules-engine-v2 Phase 2): resolves open-case/duplicate/
 *                          thread context, logs an always-on decision-telemetry event, and
 *                          (suggest_attach/propose_cancellation only) writes a best-effort
 *                          ai_suggestion row. Returns ONE action the orchestrator routes on
 *                          below (§ "1.55 routing") — never recomputed inline.
 *   1.55b triageClassify  → gated/triage-classify.ts (Stage C, ADR-0019 / rules-engine-v2
 *          (gated)         Phase 4): scheduled only for abstain/uncorroborated_* rows
 *                          (shouldAttemptTriageAssist — pure, classification-shape only,
 *                          replay-safe); EMAIL_AI_ENABLED + model-configured gate live
 *                          INSIDE the activity, never read here. Suggestion-only; never
 *                          changes routing below.
 *   1.6  linkReply (#3)  → Data API: a REPLY about existing work links to its OPEN case (no mint)
 *   4.   parse           → parser Python Function (gated PDF_MAPPER_ENABLED) — runs BEFORE
 *                          caseResolve so its PDF VRM/mileage feed case-create + enrichment (#7/#1)
 *   2.   caseResolve     → Data API: ADR-0010 dedup ladder + Case/PO mint / new-client→Held (#11)
 *   2.1  setIngested     → Data API: new_email → ingested (TKT-027 — intake picked up)
 *   2.5  boxFolder (#6)  → callSubOrchestrator boxFolderCreateOrchestrator for a known-provider
 *                          case (case_po present) — Box folder named with the Case/PO (ADR-0012).
 *                          Gated + idempotent INSIDE the activity; best-effort (never blocks intake).
 *   3.   classifyPersist → Data API: classify attachments + persist evidence rows
 *   5.   statusEvaluate  → Data API: EVA-readiness + status machine
 *   6.   enrich          → enrichment Python Function (gated ENRICHMENT_ENABLED) + persist (#1)
 *
 * Retry policy: 5 s first retry, 2x backoff, max 60 s interval, 3 attempts per activity.
 * An exhausted activity throws — the orchestrator can catch to route to Held/error state.
 */

import * as df from 'durable-functions';
import { supplementAccidentCircumstancesFromBody } from '../lib/supplement-parse.js';
import type { InboundClassification } from './activities/classifyInbound.js';
import { shouldAttemptTriageAssist } from './gated/triage-classify.js';
import { decideCaseType, decideRetro } from '@cs/domain';
import type { TriagePolicyDecision } from '@cs/domain';

const retry = new df.RetryOptions(/*firstRetryIntervalInMilliseconds*/ 5_000, /*maxNumberOfAttempts*/ 3);
retry.backoffCoefficient = 2;
retry.maxRetryIntervalInMilliseconds = 60_000;

df.app.orchestration('intakeOrchestrator', function* (ctx) {
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

  // 1.5 — triage classify (ADR-0015): records the classified inbound_email row and decides
  // whether this email is RECEIVING WORK (→ a Case) or a QUERY / OTHER (→ no Case), and flags
  // a reply about existing work (is_reply, #3).
  const classification = (yield ctx.df.callActivityWithRetry('classifyInbound', retry, {
    inbound,
    workProviderId,
    matchState,
  })) as InboundClassification;

  // 1.55 — triage policy (Stage B, ADR-0019 / rules-engine-v2 Phase 2): resolve the LIVE
  // open-case/duplicate/thread context `decideTriage` needs and turn (classification x
  // context) into ONE triage action. The activity ALWAYS runs (the context read + the
  // always-on decision-telemetry event are both explicitly in-scope additions — see the
  // activity's own module doc), computing a `shadow` decision (all four TRIAGE_* gates
  // forced on — would-be decision, telemetry only) alongside the `acting` decision (the
  // real gates) it returns.
  //
  // KILL-SWITCH INVARIANT: with every TRIAGE_*_ENABLED gate absent, `acting` is ALWAYS
  // 'proceed_default' (decideTriage's own construction — not special-cased here), so with
  // all four gates off the routing below is a no-op and the chain from here down is
  // byte-for-byte identical to pre-Phase-2 behaviour.
  const triage = (yield ctx.df.callActivityWithRetry('triagePolicy', retry, {
    inbound,
    classification,
    matchState,
    ...(intermediaryImageSourceId
      ? { intermediaryImageSourceId, intermediaryCandidateProviderIds }
      : {}),
  })) as TriagePolicyDecision;

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
        // (work_provider.ai_allowed, docs/gated.md D6) without re-resolving. Undefined when the
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

  // suggest_attach / propose_cancellation / route_images_unmatched: the DECISION (and, for
  // the first two, the best-effort ai_suggestion write) already happened INSIDE the
  // triagePolicy activity. NONE of the three change ROUTING this release (ADR-0019 §4's
  // suggest-first promotion ladder — promoting a decision to an automatic action is a
  // DOCUMENTED FUTURE SEAM, not built here):
  //   - suggest_attach: a receiving_work email still mints its own case exactly as today
  //     (the flow below branches on classification.category, Stage A's own label — NEVER
  //     on triage.finalCategory); staff act on the suggestion from the inbox. VRM-only
  //     matches NEVER promote past suggestion (ADR-0010) — permanently, not a release-1
  //     caveat.
  //   - propose_cancellation: category 'cancellation' is already !== 'receiving_work', so
  //     the branch below already routes it via the linkReply/query lane unchanged; this
  //     action never auto-closes or auto-holds a case.
  //   - route_images_unmatched: TODO(ADR-0015 §5) — the reg-keyed Box dumping-folder lane
  //     for images with no case match is a FOLLOW-UP, not built here. The decision is
  //     still logged (above) and telemetered (inside the activity) so it stays visible
  //     ahead of that build, but no side-effect fires for it in this release.

  // QUERY / OTHER never mint a Case — the inbound_email triage row IS the record. BUT a REPLY
  // about existing work (#3) links/appends to its OPEN case (Case-ref first, then VRM; >1 →
  // Held, never auto-link — the DB lookup + ADR-0010 decision run in the Data API). When a
  // reply links to a case, still run the record-keeping path so its email/attachments/images
  // are evidence and can be mirrored into the archive.
  if (classification.category !== 'receiving_work') {
    if (classification.isReply) {
      const inb = inbound as { candidateRef?: string; candidateVrm?: string };
      const ref = ((inb.candidateRef || classification.bodyCaseref) ?? '').trim();
      const vrm = ((inb.candidateVrm || classification.bodyVrm) ?? '').trim();
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
        yield ctx.df.callActivityWithRetry('classifyPersist', retry, {
          caseId: link.caseId,
          inbound,
        });

        try {
          yield ctx.df.callActivityWithRetry('extractImages', retry, {
            caseId: link.caseId,
            messageId: (inbound as { messageId?: string }).messageId,
            attachments: (inbound as { attachments?: unknown }).attachments,
            caseVrm: vrm || (inbound as { candidateVrm?: string }).candidateVrm,
          });
        } catch (e) {
          if (!ctx.df.isReplaying) {
            ctx.log(`[intake] image extraction failed for linked reply case ${link.caseId} (additive, non-blocking): ${String(e)}`);
          }
        }

        try {
          yield ctx.df.callActivityWithRetry('boxArchiveEvidence', retry, {
            caseId: link.caseId,
          });
        } catch (e) {
          if (!ctx.df.isReplaying) {
            ctx.log(`[intake] archive failed for linked reply case ${link.caseId} (additive, non-blocking): ${String(e)}`);
          }
        }

        const status = (yield ctx.df.callActivityWithRetry('statusEvaluate', retry, {
          caseId: link.caseId,
        })) as { value: string };
        return {
          triaged: classification.category,
          subtype: classification.subtype,
          replyLink: link.outcome,
          caseId: link.caseId,
          status: status.value,
        };
      }
      // Retro fallback (ADR-0022, ADDITIVE + LAST in this lane): an unmatched reply about a
      // case the system has never seen may be linkable/reconstructable from the archive.
      // decideRetro is pure over checkpointed values (the decideCaseType convention —
      // replay-safe, no env reads); `ambiguous` never fires it (≥2 open cases already
      // match). The sub-orchestration is try/catch-wrapped + gated inside its activities,
      // so the primary return below is never blocked or changed — `retro` is an added key.
      const retroReply = decideRetro({
        category: classification.category,
        bodyCaseref: classification.bodyCaseref,
        bodyJobref: classification.bodyJobref,
        bodyVrm: classification.bodyVrm,
        candidateRef: inb.candidateRef,
        candidateVrm: inb.candidateVrm,
        isReply: true,
        linkReplyOutcome: link.outcome as 'linked' | 'ambiguous' | 'no_match',
      });
      let retroReplyOutcome: string | undefined;
      if (retroReply.attempt) {
        try {
          const retro = (yield ctx.df.callSubOrchestratorWithRetry('retroCaseOrchestrator', retry, {
            trigger: inbound,
            category: classification.category,
            subtype: classification.subtype,
            keys: retroReply.keys,
            providerId: workProviderId,
            providerPrincipal: principalCode,
          })) as { outcome?: string };
          retroReplyOutcome = retro?.outcome;
        } catch (e) {
          retroReplyOutcome = 'error';
          if (!ctx.df.isReplaying) {
            ctx.log(`[intake] retro fallback failed (additive, non-blocking): ${String(e)}`);
          }
        }
      }
      return {
        triaged: classification.category,
        subtype: classification.subtype,
        replyLink: link.outcome,
        ...(link.caseId ? { caseId: link.caseId } : {}),
        ...(retroReplyOutcome ? { retro: retroReplyOutcome } : {}),
      };
    }

    // Retro fallback (ADR-0022) for the NON-reply lane — today these return without any
    // linking attempt at all, which is exactly the billing-email gap. Same conventions as
    // the reply-lane block above (pure decideRetro, gated activities, additive, last).
    const inbNonReply = inbound as { candidateRef?: string; candidateVrm?: string };
    const retroNonReply = decideRetro({
      category: classification.category,
      bodyCaseref: classification.bodyCaseref,
      bodyJobref: classification.bodyJobref,
      bodyVrm: classification.bodyVrm,
      candidateRef: inbNonReply.candidateRef,
      candidateVrm: inbNonReply.candidateVrm,
      isReply: false,
    });
    let retroOutcome: string | undefined;
    if (retroNonReply.attempt) {
      try {
        const retro = (yield ctx.df.callSubOrchestratorWithRetry('retroCaseOrchestrator', retry, {
          trigger: inbound,
          category: classification.category,
          subtype: classification.subtype,
          keys: retroNonReply.keys,
          providerId: workProviderId,
          providerPrincipal: principalCode,
        })) as { outcome?: string };
        retroOutcome = retro?.outcome;
      } catch (e) {
        retroOutcome = 'error';
        if (!ctx.df.isReplaying) {
          ctx.log(`[intake] retro fallback failed (additive, non-blocking): ${String(e)}`);
        }
      }
    }
    return {
      triaged: classification.category,
      subtype: classification.subtype,
      ...(retroOutcome ? { retro: retroOutcome } : {}),
    };
  }

  // RECEIVING WORK → carry the body-derived Case/PO into the dedup ladder (Case/PO-first,
  // VRM fallback — ADR-0015 §5) when the subject hadn't already yielded one.
  const inboundForCase = {
    ...(inbound as Record<string, unknown>),
    candidateRef:
      ((inbound as { candidateRef?: string }).candidateRef || classification.bodyCaseref) ?? '',
  };

  // 4 (runs FIRST now) — parse the instruction document so its PDF VRM + mileage feed case
  // creation (#7) and enrichment (#1). Gate PDF_MAPPER_ENABLED + skip-on-no-doc/4xx handled
  // inside; result is the parser envelope or { skipped }. No caseId yet (case not created).
  //
  // BEST-EFFORT (resilience #95): parse.ts throws on a sustained 5xx/network outage AFTER its
  // retries are exhausted. Because parse now runs FIRST, that throw would sink the whole
  // orchestration → NO Case is ever minted for the email (a regression vs the old order). So the
  // call is wrapped: on total parser failure we log (once, guarded by !isReplaying) and continue
  // with an EMPTY parse result so case-create still proceeds on the email-sniff VRM. The retry
  // policy still absorbs transient blips; only a total outage falls through here.
  let parseResult: {
    vrm?: { value?: string };
    reference?: { value?: string };
    extraction?: Record<string, { value?: string } | undefined>;
    skipped?: boolean;
  } = {};
  try {
    parseResult = (yield ctx.df.callActivityWithRetry('parse', retry, {
      messageId: (inbound as { messageId?: string }).messageId,
      attachments: (inbound as { attachments?: unknown }).attachments,
      providerHint: principalCode,
    })) as {
      vrm?: { value?: string };
      reference?: { value?: string };
      extraction?: Record<string, { value?: string } | undefined>;
      skipped?: boolean;
    };
  } catch (e) {
    if (!ctx.df.isReplaying) {
      ctx.log(
        `[intake] parse failed after retries (parser outage) — proceeding with empty parse result so case-create still runs: ${String(e)}`,
      );
    }
  }
  const parserVrm = (parseResult.vrm?.value ?? '').trim();
  // The document is authoritative for mileage (ADR-0006): true only when the parser actually
  // extracted a mileage value → enrichment then SKIPS the MOT estimate.
  const documentHasMileage = Boolean(parseResult.extraction?.mileage?.value);
  // #100 — a provider reference appearing ONLY in the instruction PDF (not the email subject/
  // body) must still feed the ADR-0010 Case/PO-first dedup ladder AND persist as case_ref.
  // #107 — the document is authoritative for mileage (ADR-0006): when the parser extracted a
  // value, persist it fill-if-empty so the suppressed MOT estimate is not a silent data loss.
  // caseResolve forwards all three to the Data API resolve-persist (fill-if-empty, provenance).
  const parserRef = (parseResult.reference?.value ?? '').trim();
  const parserMileage = (parseResult.extraction?.mileage?.value ?? '').trim();
  const parserMileageUnit = (parseResult.extraction?.mileage_unit?.value ?? '').trim();

  // The parser extracts ALL 12 EVA fields; intake historically forwarded only VRM/ref/mileage,
  // so an email-minted case showed just its registration + Case/PO. Forward parser-owned EVA
  // fields (caseResolve → resolve-persist fills them fill-if-empty + constraint-guarded).
  // inspection_address is omitted (corpus picker — ADR-0013). work_provider is forwarded
  // when present; UNKNOWN is treated as empty and the Data API falls back to corpus display_name.
  const ex = parseResult.extraction ?? {};
  const exVal = (k: string): string => (ex[k]?.value ?? '').trim();
  const exWorkProvider = exVal('work_provider');
  const parserEvaFields = {
    work_provider: exWorkProvider.toUpperCase() === 'UNKNOWN' ? '' : exWorkProvider,
    vehicle_model: exVal('vehicle_model'),
    claimant_name: exVal('claimant_name'),
    claimant_telephone: exVal('claimant_telephone'),
    claimant_email: exVal('claimant_email'),
    date_of_loss: exVal('date_of_loss'),
    date_of_instruction: exVal('date_of_instruction'),
    accident_circumstances:
      exVal('accident_circumstances') ||
      supplementAccidentCircumstancesFromBody(String((inbound as { body?: string }).body ?? '')),
    vat_status: exVal('vat_status'),
  };

  // Case-type decision (ADR-0021) — pure + deterministic over the two CHECKPOINTED
  // activity results (parse envelope + Stage-A classification), so it is replay-safe
  // in the orchestrator body. The parser's doc-text case_type is primary; the legacy
  // audit envelope and the classifier subtype are fallback/corroboration. APPLYING the
  // decision (case_type_code write + marker mint) is gated by AUDIT_CASES_ENABLED
  // INSIDE the Data API — forwarding is unconditional (shadow rollout: gate off, the
  // API records an observe-only audit_event and mints/types exactly as today).
  const caseTypeDecision = decideCaseType({
    parserCaseType: (parseResult as {
      case_type?: { value?: string | null; dual?: boolean; signals?: string[] };
    }).case_type,
    parserAudit: (parseResult as { audit?: { value?: boolean; signals?: string[] } }).audit,
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
  };

  if (resolved.outcome === 'already_ingested') {
    return { skipped: true, caseId: resolved.caseId };
  }

  // 2.1 — mark the case as ingested (picked up by the intake pipeline); sets status
  // new_email → ingested so staff see "Logged" instead of "New email" during processing.
  // statusEvaluate (step 5) will compute the final review state.
  yield ctx.df.callActivityWithRetry('setIngested', retry, { caseId: resolved.caseId });

  // Automation-mode branch (am ticket). RECONCILED (work-todo-spike "Both", 2026-06-30):
  // Box folder-create + evidence-archive + image-extraction are RECORD-KEEPING and now run
  // for ANY known-provider case (case_po present) REGARDLESS of mode — they were the cause of
  // "folders not getting made / box sync not working" when every provider resolved to manual.
  // Only ENRICHMENT (and the reserved EVA-submit) remain gated by automation mode:
  //   • manual      — record + classify + persist evidence + Box folder + Box archive + image
  //                   extraction, but DO NOT auto-enrich (staff trigger enrichment from the queue).
  //   • review_auto — the default live path: everything manual does PLUS auto-enrichment, still
  //                   stopping short of EVA submission (always a staff action).
  //   • full_auto   — RESERVED. Behaves EXACTLY as review_auto today; its aggressive steps
  //                   (auto-EVA, auto-chaser, …) stay behind a default-off flag (FULL_AUTO_ENABLED)
  //                   and are intentionally NOT enabled here (ADR-0015 / am research §full).
  const automationMode = resolved.providerAutomationMode ?? 'review_auto';
  const autoEnrich = automationMode !== 'manual';
  if (!autoEnrich && !ctx.df.isReplaying) {
    ctx.log(`[intake] provider automation mode = manual for case ${resolved.caseId}; record-keeping (Box folder/archive/images) runs, enrichment deferred to staff`);
  }

  // 2.5 — Box folder at intake (#6, ADR-0012: additive one-way mirror). A known-provider case
  // has its Case/PO minted by caseResolve → create the Box folder named with it. A new client
  // routed to Held has NO case_po → NO folder (the operator sets up the provider/PO first), so
  // the call is guarded on casePo present. The BOX_API_ENABLED + BOX_FOLDER_AT_INTAKE_ENABLED
  // gates AND the box_folder_id idempotency check live INSIDE the boxFolderCreate activity —
  // an orchestrator must stay deterministic across replays, so it never reads env gates itself
  // (the parse/enrich/chaser convention; the recorded activity result is what replays). The
  // mirror is additive: a Box failure must NOT block the core intake (evidence/status/enrich),
  // so it is best-effort here — the manual box-folder-create starter can retry.
  // Runs for ANY known-provider case (casePo present) regardless of mode (work-todo-spike "Both").
  if (resolved.casePo) {
    try {
      yield ctx.df.callSubOrchestratorWithRetry('boxFolderCreateOrchestrator', retry, {
        caseId: resolved.caseId,
        folderName: resolved.casePo.toUpperCase(),
      });
    } catch (e) {
      if (!ctx.df.isReplaying) {
        ctx.log(`[intake] box folder create failed for case ${resolved.caseId} (additive, non-blocking): ${String(e)}`);
      }
    }
  }

  // 3 — classify + persist evidence rows (always — recording evidence is not "advancing").
  // attachmentTypings (parse activity, ADR-0014/ADR-0021) lets a report-typed attachment
  // persist as engineer_report evidence; the AUDIT_CASES_ENABLED gate lives INSIDE the
  // activity (orchestrator determinism), so forwarding is unconditional.
  yield ctx.df.callActivityWithRetry('classifyPersist', retry, {
    caseId: resolved.caseId,
    inbound,
    typings: (parseResult as { attachmentTypings?: unknown }).attachmentTypings,
  });

  // 3.5 — extract embedded images from instruction PDFs/EML into image evidence
  // (#pdf-image-extraction). RECORD-KEEPING — runs regardless of automation mode
  // (work-todo-spike "Both"); the BOX/image gates + best-effort handling live INSIDE the
  // activity. Persists each image as an evidence row + flags an unsuitable set (no viewable
  // registration). Runs after evidence persist so the case exists.
  try {
    yield ctx.df.callActivityWithRetry('extractImages', retry, {
      caseId: resolved.caseId,
      messageId: (inbound as { messageId?: string }).messageId,
      attachments: (inbound as { attachments?: unknown }).attachments,
      caseVrm: parserVrm || (inbound as { candidateVrm?: string }).candidateVrm,
    });
  } catch (e) {
    if (!ctx.df.isReplaying) {
      ctx.log(`[intake] image extraction failed for case ${resolved.caseId} (additive, non-blocking): ${String(e)}`);
    }
  }

  // 3.6 — Box ARCHIVE (#box-sync): copy persisted blob-backed evidence rows INTO the
  // case Box folder. Runs after all evidence generation so raw email, body text,
  // attachments, and extracted images are covered. The activity skips cleanly when
  // an attached/replied case has no archive folder yet.
  try {
    yield ctx.df.callActivityWithRetry('boxArchiveEvidence', retry, {
      caseId: resolved.caseId,
    });
  } catch (e) {
    if (!ctx.df.isReplaying) {
      ctx.log(`[intake] box archive failed for case ${resolved.caseId} (additive, non-blocking): ${String(e)}`);
    }
  }

  // 5 — status evaluate (EVA-readiness + status machine via Data API)
  const status = (yield ctx.df.callActivityWithRetry('statusEvaluate', retry, {
    caseId: resolved.caseId,
  })) as { value: string };

  // 6 — enrich (gate ENRICHMENT_ENABLED checked inside; no-op when off). Pass the best VRM
  // (parser PDF VRM preferred over the email sniff) + whether the doc already had mileage;
  // the activity persists the advisory result onto the case on a 200 (#1). The ONE step still
  // gated by automation mode: skipped in `manual` (staff trigger enrichment from the queue).
  if (autoEnrich) {
    yield ctx.df.callActivityWithRetry('enrich', retry, {
      caseId: resolved.caseId,
      vrm: parserVrm || (inbound as { candidateVrm?: string }).candidateVrm,
      documentHasMileage,
    });
  }

  return { caseId: resolved.caseId, status: status.value, mode: automationMode };
});
