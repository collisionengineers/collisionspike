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
 *   1.6  linkReply (#3)  → Data API: a REPLY about existing work links to its OPEN case (no mint)
 *   4.   parse           → parser Python Function (gated PDF_MAPPER_ENABLED) — runs BEFORE
 *                          caseResolve so its PDF VRM/mileage feed case-create + enrichment (#7/#1)
 *   2.   caseResolve     → Data API: ADR-0010 dedup ladder + Case/PO mint / new-client→Held (#11)
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

  // 1.5 — triage classify (ADR-0015): records the classified inbound_email row and decides
  // whether this email is RECEIVING WORK (→ a Case) or a QUERY / OTHER (→ no Case), and flags
  // a reply about existing work (is_reply, #3).
  const classification = (yield ctx.df.callActivityWithRetry('classifyInbound', retry, {
    inbound,
    workProviderId,
    matchState,
  })) as {
    category: string;
    subtype: string;
    bodyCaseref: string;
    bodyVrm: string;
    isReply: boolean;
  };

  // QUERY / OTHER never mint a Case — the inbound_email triage row IS the record. BUT a REPLY
  // about existing work (#3) links/appends to its OPEN case (Case-ref first, then VRM; >1 →
  // Held, never auto-link — the DB lookup + ADR-0010 decision run in the Data API).
  if (classification.category !== 'receiving_work') {
    if (classification.isReply) {
      const inb = inbound as { candidateRef?: string; candidateVrm?: string };
      const ref = ((inb.candidateRef || classification.bodyCaseref) ?? '').trim();
      const vrm = ((inb.candidateVrm || classification.bodyVrm) ?? '').trim();
      const link = (yield ctx.df.callActivityWithRetry('linkReply', retry, {
        inbound,
        providerId: workProviderId,
        ref,
        vrm,
      })) as { outcome: string; caseId?: string };
      return {
        triaged: classification.category,
        subtype: classification.subtype,
        replyLink: link.outcome,
        ...(link.caseId ? { caseId: link.caseId } : {}),
      };
    }
    return { triaged: classification.category, subtype: classification.subtype };
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
  const parseResult = (yield ctx.df.callActivityWithRetry('parse', retry, {
    messageId: (inbound as { messageId?: string }).messageId,
    attachments: (inbound as { attachments?: unknown }).attachments,
    providerHint: principalCode,
  })) as {
    vrm?: { value?: string };
    extraction?: { mileage?: { value?: string } };
    skipped?: boolean;
  };
  const parserVrm = (parseResult.vrm?.value ?? '').trim();
  // The document is authoritative for mileage (ADR-0006): true only when the parser actually
  // extracted a mileage value → enrichment then SKIPS the MOT estimate.
  const documentHasMileage = Boolean(parseResult.extraction?.mileage?.value);

  // 2 — case-resolve (UNIQUE(sourcemessageid) backstop makes upsert idempotent). The parser
  // VRM is preferred over the email sniff for dedup scoping AND the persisted case VRM (#7);
  // a known provider mints the Case/PO, a new client (no provider) routes to Held (#11).
  const resolved = (yield ctx.df.callActivityWithRetry('caseResolve', retry, {
    inbound: inboundForCase,
    providerId: workProviderId,
    matchState,
    parserVrm,
  })) as { outcome: string; caseId: string; casePo?: string | null };

  if (resolved.outcome === 'already_ingested') {
    return { skipped: true, caseId: resolved.caseId };
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

  // 3 — classify + persist evidence rows
  yield ctx.df.callActivityWithRetry('classifyPersist', retry, {
    caseId: resolved.caseId,
    inbound,
  });

  // 5 — status evaluate (EVA-readiness + status machine via Data API)
  const status = (yield ctx.df.callActivityWithRetry('statusEvaluate', retry, {
    caseId: resolved.caseId,
  })) as { value: string };

  // 6 — enrich (gate ENRICHMENT_ENABLED checked inside; no-op when off). Pass the best VRM
  // (parser PDF VRM preferred over the email sniff) + whether the doc already had mileage;
  // the activity persists the advisory result onto the case on a 200 (#1).
  yield ctx.df.callActivityWithRetry('enrich', retry, {
    caseId: resolved.caseId,
    vrm: parserVrm || (inbound as { candidateVrm?: string }).candidateVrm,
    documentHasMileage,
  });

  return { caseId: resolved.caseId, status: status.value };
});
