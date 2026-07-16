/**
 * (ADR-0022 / TKT-058 / TKT-219).
 *
 * The SECONDARY, gated fallback behind the primary intake: when a billing /
 * case_update / cancellation / query email (plus, locate-only, an acknowledgement or an
 * `other`-classified email — TKT-119/TKT-219) matches NO case, this sub-orchestration
 * runs the reconstruction ladder:
 *
 *   rung 1  retroResolveExisting — ANY-status existence check (incl. terminals)
 *           via the Data API; a hit LINKS the trigger email and stops.  [R1]
 *   rungs 2+3 IN PARALLEL (TKT-219 — operator directive 2026-07-16):
 *           Box archive — content-search the READ-ONLY archive root(s) by the
 *           email's keys (external ref / VRM / claimant; a quoted Case/PO is
 *           opportunistic), consolidate hits to ONE case folder (never guess),
 *           discover the Case/PO from the folder name, download + explode the
 *           original instruction `.eml` (or document).                   [R2]
 *           Outlook $search — find the original instruction in the scoped
 *           mailboxes (deep, sent-date-sorted, bounded paging).          [R3]
 *           The findings COMBINE via the pure planRetroReconstruction matrix:
 *           parseable Box material wins; a folder with NOTHING parseable plus a
 *           corroborated Outlook original becomes a COMBINED create (Outlook
 *           material + Box identity) instead of a data-empty anchor; no folder →
 *           Outlook-only; folder + no Outlook → minimal Held anchor.
 *   bottom  nothing at all → audit retro_reconstruction_failed + the visible
 *           `unable_to_locate` attention stamp; the triage row is otherwise
 *           left exactly as today.
 *
 * Whatever arm creates the case then runs the SAME record-keeping chain as a live
 * arrival: parse → create (applyParserFields) → classifyPersist (case VRM + resolved
 * provider — the per-provider AI opt-out holds on retro runs) → extractImages →
 * statusEvaluate. Deliberate skips: NO enrich (vehicle data adds nothing here); NO
 * boxFolderCreate on the Box/combined arms (the ARCHIVE folder is stamped in the
 * create; the Outlook-only arm DOES ensure a folder once provider identity completes);
 * NO boxArchiveEvidence (uploads into the RO archive are refused by design).
 *
 * Gates: RETRO_CASE_ENABLED (+ BOX_API_ENABLED + RETRO_BOX_ARCHIVE_ROOT_IDS for
 * the Box rung; RETRO_OUTLOOK_SEARCH_ENABLED for the Outlook rung) — read INSIDE
 * the activities (never the orchestrator body; the parse/enrich convention) so
 * decisions are recorded in Durable history and stay replay-safe. Gate off →
 * honest { skipped } no-ops. The Data API enforces RETRO_CASE_ENABLED server-side
 * too (set it on BOTH apps), and RETRO_ADOPT_ARCHIVE_PO_ENABLED (TKT-219) decides
 * whether a discovered archive PO is adopted verbatim (live) or recorded as
 * case_ref while the normal allocator mints (dev/test).
 *
 * Triggers: (1) the intake orchestrator (the two unmatched non-receiving_work
 * returns) via callSubOrchestratorWithRetry; (2) the keyed manual HTTP starter —
 * the operator's drain lever for the EXISTING pile of un-linked triage rows
 * (input = the row's source_message_id + source_mailbox; the orchestrator
 * re-fetches + re-classifies so the run is identical to a live arrival).
 *
 * Never blocks or reorders the primary intake: invoked AFTER every existing
 * activity in its lane, try/catch-wrapped at the call site, additive result key.
 * The archive is READ-ONLY throughout (list/search/download; the scope lock in
 * the box-webhook Function refuses writes under the RO roots).
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import type { Task } from 'durable-functions';
import { gates } from '@cs/domain/gates';
import {
  decideCaseType,
  decideRetro,
  decideRetroStatus,
  hasUsableRetroKey,
  markerToCaseType,
  planRetroReconstruction,
  type InboundCategory,
  type RetroKeys,
  type RetroReconstructionSource,
} from '@cs/domain';
import type { ParserEvaFields } from '../../adapters/data-api.js';
import {
  resolveClaimantInputs,
  supplementAccidentCircumstancesFromBody,
  supplementClaimantNameFromBody,
} from '../../platform/supplement-parse.js';
import type { InboundEnvelope } from '../intake/fetchMessage.js';
import type { InboundClassification } from '../intake/classifyInbound.js';

/** The parse activity's envelope shape as the retro rungs consume it. */
interface RetroParseResult {
  vrm?: { value?: string };
  reference?: { value?: string };
  extraction?: Record<string, { value?: string } | undefined>;
  /** TKT-220 (G5) — the instructing provider resolved across ALL parsed docs
   *  (parse.ts resolveWorkProviderAcrossDocs); preferred over the chosen envelope's
   *  extraction exactly as live intake does. */
  resolvedWorkProvider?: string;
  skipped?: boolean;
}

/** Pure mapping of a parse envelope onto the create payload's parser fields —
 *  mirrors intakeOrchestrator's forwarding block exactly (fill-if-empty semantics
 *  live in the API). Replay-safe: pure over checkpointed activity results. */
export function mapRetroParse(
  parseResult: RetroParseResult,
  bodyText: string,
  sourceReference: string,
): {
  parserEva: ParserEvaFields;
  parserVrm: string;
  parserRef: string;
  parserMileage: string;
  parserMileageUnit: string;
} {
  const ex = parseResult.extraction ?? {};
  const exVal = (k: string): string => (ex[k]?.value ?? '').trim();
  // TKT-220 (G5) — mirror intake exactly: prefer the cross-document resolved provider (an
  // audit-shaped reconstruction's chosen envelope may be the EVA report whose own
  // extraction.work_provider is blank); fall back to the chosen envelope's value.
  const exWorkProvider = (parseResult.resolvedWorkProvider ?? '').trim() || exVal('work_provider');
  const claimantInputs = resolveClaimantInputs(
    exVal('claimant_name'),
    supplementClaimantNameFromBody(bodyText),
  );
  const stableSourceReference = sourceReference.trim().slice(0, 400);
  return {
    parserEva: {
      source_reference: stableSourceReference,
      work_provider: exWorkProvider.toUpperCase() === 'UNKNOWN' ? '' : exWorkProvider,
      vehicle_model: exVal('vehicle_model'),
      claimant_name: claimantInputs.value,
      claimant_telephone: exVal('claimant_telephone'),
      claimant_email: exVal('claimant_email'),
      date_of_loss: exVal('date_of_loss'),
      date_of_instruction: exVal('date_of_instruction'),
      accident_circumstances:
        exVal('accident_circumstances') || supplementAccidentCircumstancesFromBody(bodyText),
      vat_status: exVal('vat_status'),
      ...(claimantInputs.fromEmailBody
        ? { sources: { claimant_name: 'email_text' as const } }
        : {}),
      ...(claimantInputs.conflicts.length > 0
        ? {
            claimant_conflicts: claimantInputs.conflicts.map((value) => ({
              value,
              source: 'email_text' as const,
              source_reference: stableSourceReference,
            })),
          }
        : {}),
    },
    parserVrm: (parseResult.vrm?.value ?? '').trim(),
    parserRef: (parseResult.reference?.value ?? '').trim(),
    parserMileage: exVal('mileage'),
    parserMileageUnit: exVal('mileage_unit'),
  };
}

/** Case-insensitive whitespace-collapsed token normalisation for corroboration. */
function normToken(v: string): string {
  return v.trim().toUpperCase().replace(/\s+/g, '');
}

export interface RetroCaseInput {
  /** Sub-orchestrator form (intake path): the checkpointed envelope + routing facts. */
  trigger?: unknown;
  category?: InboundCategory;
  subtype?: string;
  keys?: RetroKeys;
  providerId?: string;
  /** The sender-matched provider's principal code (providerMatch) — the weak-key-only
   *  Box-pick corroboration key (folder principal must agree; never cross providers). */
  providerPrincipal?: string;
  /** TKT-219 — the sender's Image-Source intermediary match (providerMatch, TKT-021):
   *  threaded through the create so a reconstruction gets the same content-corroboration
   *  and single-candidate provider fallback as a live arrival. */
  intermediary?: { imageSourceId: string; candidateProviderIds: string[] };
  /** Manual-starter form (operator drain): locate the message, then re-derive the rest.
   *  `internetMessageId` + `mailbox` = inbound_email.source_message_id + source_mailbox. */
  internetMessageId?: string;
  mailbox?: string;
  /** TKT-223 — restart a COMPLETED drain instance (a prior no_source / trigger_not_found run)
   *  so failed reconstructions can be re-driven after conditions change (e.g. the Box archive
   *  grant lands). Safe by construction: rung 1 links first, the create is get-or-create under
   *  the live mint's locks, and already-linked rows are never re-pointed. A Running/Pending
   *  instance is never force-restarted. */
  force?: boolean;
}

const retry = new df.RetryOptions(5_000, 3);
retry.backoffCoefficient = 2;
retry.maxRetryIntervalInMilliseconds = 60_000;

export class ProviderArchivePendingError extends Error {}

/* ============================================================
   Manual starter — the operator drain lever (authLevel 'function': this lever
   drives Graph reads + case writes for a caller-supplied message, so it is
   keyed, unlike the box-folder starter whose input is a bare caseId).
   ============================================================ */
app.http('retro-case-start', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'retro-case',
  extraInputs: [df.input.durableClient()],
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!gates.retroCase()) {
      ctx.log('[retro-case] skipped — RETRO_CASE_ENABLED off');
      return { status: 200, jsonBody: { skipped: true, reason: 'gated off' } };
    }
    const input = (await req.json()) as RetroCaseInput;
    if (!input.internetMessageId || !input.mailbox) {
      return { status: 400, jsonBody: { error: 'internetMessageId and mailbox required' } };
    }
    const client = df.getClient(ctx);
    // Deterministic instance id (the intake-starter pattern) so a re-triggered drain of the
    // same email resumes/dedupes instead of double-running.
    const safeId = String(input.internetMessageId).replace(/[^A-Za-z0-9_-]/g, '');
    const instanceId = `retro-${safeId}`;
    let existing;
    try {
      existing = await client.getStatus(instanceId);
    } catch {
      existing = undefined; // 404 = first run
    }
    const runtimeStatus = existing?.runtimeStatus as string | undefined;
    // A live instance is NEVER restarted (double-run risk). A finished one is restarted only
    // when the caller says so: Failed/Terminated always could be; TKT-223 adds force=true for
    // Completed instances whose outcome was a failure (no_source / trigger_not_found) so the
    // pile can be re-driven once conditions change (e.g. the Box archive grant lands).
    const isLive = runtimeStatus === 'Running' || runtimeStatus === 'Pending';
    const isRestartable =
      runtimeStatus === 'Failed' || runtimeStatus === 'Terminated' || input.force === true;
    if (runtimeStatus && (isLive || !isRestartable)) {
      ctx.log(`[retro-case] instance ${instanceId} already ${runtimeStatus} — not restarted`);
      return { status: 200, jsonBody: { instanceId, deduped: true, runtimeStatus } };
    }
    if (runtimeStatus && input.force === true) {
      ctx.log(`[retro-case] force rerun of ${runtimeStatus} instance ${instanceId} (TKT-223)`);
    }
    await client.startNew('retroCaseOrchestrator', { instanceId, input });
    return client.createCheckStatusResponse(req, instanceId);
  },
});

/* ============================================================
   The reconstruction ladder orchestrator
   ============================================================ */
df.app.orchestration('retroCaseOrchestrator', function* (ctx): Generator<Task, unknown, never> {
  const input = ctx.df.getInput() as RetroCaseInput;

  let trigger = input.trigger;
  let category = input.category;
  let subtype = input.subtype;
  let keys = input.keys;
  let providerId = input.providerId;
  let providerPrincipal = input.providerPrincipal;
  let intermediary = input.intermediary;

  // Manual-drain form: locate + fetch + classify the trigger so the run is identical to a
  // live arrival (same activities, same triage-row upsert, same decideRetro eligibility).
  if (!trigger) {
    if (!input.internetMessageId || !input.mailbox) {
      return { outcome: 'bad_input', reason: 'trigger envelope or internetMessageId+mailbox required' };
    }
    const located = (yield ctx.df.callActivityWithRetry('retroFindTrigger', retry, {
      internetMessageId: input.internetMessageId,
      mailbox: input.mailbox,
    })) as { skipped?: string; found?: boolean; messageId?: string; resource?: string };
    if (located.skipped) return { outcome: 'skipped', reason: located.skipped };
    if (!located.found) {
      // TKT-219 — a drain trigger that can no longer be resolved by internetMessageId still
      // gets a VISIBLE home (the TKT-140 drain left 19 such rows un-cased AND un-stamped):
      // record the failure so the triage row carries the `unable_to_locate` attention chip.
      try {
        yield ctx.df.callActivityWithRetry('retroRecordFailure', retry, {
          trigger: { internetMessageId: input.internetMessageId },
          keys: {},
          rungsTried: ['find_trigger'],
        });
      } catch (e) {
        if (!ctx.df.isReplaying) {
          ctx.log(`[retro] trigger_not_found stamp failed (best-effort): ${String(e)}`);
        }
      }
      return { outcome: 'trigger_not_found' };
    }

    trigger = yield ctx.df.callActivityWithRetry('fetchMessage', retry, {
      messageId: located.messageId,
      resource: located.resource,
    });
    const provider = (yield ctx.df.callActivityWithRetry('providerMatch', retry, trigger)) as {
      outcome?: string;
      workProviderId?: string;
      matchState?: string;
      principalCode?: string;
      imageSourceId?: string;
      candidateProviderIds?: string[];
    };
    providerId = provider.workProviderId;
    providerPrincipal = provider.principalCode;
    // TKT-219 — the drain path resolves the sender itself, so the intermediary match
    // (TKT-021, e.g. Connexus) comes from THIS providerMatch, not the caller.
    if (provider.outcome === 'intermediary' && provider.imageSourceId) {
      intermediary = {
        imageSourceId: provider.imageSourceId,
        candidateProviderIds: provider.candidateProviderIds ?? [],
      };
    }
    const classification = (yield ctx.df.callActivityWithRetry('classifyInbound', retry, {
      inbound: trigger,
      workProviderId: providerId,
      matchState: provider.matchState,
    })) as InboundClassification;
    category = classification.category;
    // TKT-220 — the drain re-classifies live; carry the subtype so decideCaseType keeps its
    // classifier corroboration exactly as an intake-path run does.
    subtype = classification.subtype;

    // Pure over checkpointed values (replay-safe — the decideCaseType/triage-assist
    // convention). No linkReplyOutcome here: the reply lane never ran on this path; the
    // resolve-existing rung below provides the same link-first/ambiguity protection.
    const env = trigger as { candidateRef?: string; candidateVrm?: string; body?: string };
    // TKT-219 — claimant name (weakest search key): only an unambiguous 'matched'
    // supplement may become a key (never guess a conflict).
    const drainClaimant = supplementClaimantNameFromBody(String(env.body ?? ''));
    const decision = decideRetro({
      category: classification.category,
      subtype: classification.subtype,
      bodyCaseref: classification.bodyCaseref,
      bodyJobref: classification.bodyJobref,
      bodyVrm: classification.bodyVrm,
      bodyClaimant: drainClaimant.status === 'matched' ? drainClaimant.value : '',
      candidateRef: env.candidateRef,
      candidateVrm: env.candidateVrm,
      isReply: classification.isReply,
    });
    if (!decision.attempt) {
      return { outcome: 'not_eligible', reasons: decision.reasons };
    }
    keys = decision.keys;
  }

  if (!hasUsableRetroKey(keys)) {
    return { outcome: 'not_eligible', reasons: ['no_usable_key'] };
  }
  const searchKeys = keys as RetroKeys;

  // Rung 1 — ANY-status existence check + link (the billing fix). A hit ends the ladder.
  const resolved = (yield ctx.df.callActivityWithRetry('retroResolveExisting', retry, {
    trigger,
    keys: searchKeys,
    providerId,
    triggerCategory: category,
  })) as { skipped?: string; outcome?: string; caseId?: string; candidateCount?: number };
  if (resolved.skipped) return { outcome: 'skipped', reason: resolved.skipped };
  if (resolved.outcome === 'gated_off') return { outcome: 'skipped', reason: 'api_gate_off' };
  if (resolved.outcome === 'linked' && resolved.caseId) {
    // TKT-220 (G7) — a rung-1 link now gets the linked-reply lane's record-keeping too:
    // the trigger's own attachments become evidence and status realigns (all best-effort;
    // boxArchiveEvidence stays deliberately absent — a retro-linked case's archive folder
    // may be under the read-only roots, which refuse uploads by design).
    const trig = trigger as InboundEnvelope;
    if (Array.isArray(trig.attachments)) {
      try {
        yield ctx.df.callActivityWithRetry('classifyPersist', retry, {
          caseId: resolved.caseId,
          inbound: trig,
          ...(searchKeys.vrm ? { caseVrm: searchKeys.vrm } : {}),
          ...(providerId ? { workProviderId: providerId } : {}),
        });
        yield ctx.df.callActivityWithRetry('extractImages', retry, {
          caseId: resolved.caseId,
          messageId: trig.messageId,
          attachments: trig.attachments,
          ...(searchKeys.vrm ? { caseVrm: searchKeys.vrm } : {}),
          ...(providerId ? { workProviderId: providerId } : {}),
          ...(providerPrincipal ? { providerPrincipal } : {}),
        });
        yield ctx.df.callActivityWithRetry('statusEvaluate', retry, { caseId: resolved.caseId });
      } catch (e) {
        if (!ctx.df.isReplaying) {
          ctx.log(`[retro] rung-1 link record-keeping failed (additive, non-blocking): ${String(e)}`);
        }
      }
    }
    return { outcome: 'linked', caseId: resolved.caseId };
  }
  if (resolved.outcome === 'ambiguous') {
    return { outcome: 'ambiguous', candidateCount: resolved.candidateCount };
  }

  const rungsTried: string[] = ['resolve_existing'];

  interface BoxLocateResult {
    skipped?: string;
    found?: boolean;
    reason?: string;
    folder?: { id: string; name: string };
    discoveredPo?: string;
    principalCode?: string;
    marker?: '' | 'A.' | 'AP.' | 'D.';
    basis?: string;
    candidateCount?: number;
  }
  interface OutlookLocateResult {
    skipped?: string;
    found?: boolean;
    messageId?: string;
    resource?: string;
    mailbox?: string;
    matchedKey?: string;
  }

  // Rungs 2+3 — TKT-219: the Box archive search and the Outlook $search are scheduled
  // TOGETHER (durable fan-out; both actions land in one history batch, so the searches run
  // concurrently). Task.all is awaited once; on a partial failure each side is salvaged
  // from its own task so one faulted rung never sinks the other (per-rung best-effort, as
  // the sequential ladder had).
  const boxLocateTask = ctx.df.callActivityWithRetry('retroBoxLocate', retry, {
    keys: searchKeys,
    providerPrincipal,
  });
  const outlookLocateTask = ctx.df.callActivityWithRetry('retroOutlookLocate', retry, {
    keys: searchKeys,
  });
  let located: BoxLocateResult = { skipped: 'rung_failed' };
  let outlook: OutlookLocateResult = { skipped: 'rung_failed' };
  try {
    const [b, o] = (yield ctx.df.Task.all([boxLocateTask, outlookLocateTask])) as [
      BoxLocateResult,
      OutlookLocateResult,
    ];
    located = b;
    outlook = o;
  } catch (e) {
    const salvage = <T>(task: unknown): T | undefined => {
      const t = task as { isCompleted?: boolean; isFaulted?: boolean; result?: unknown };
      return t && t.isCompleted === true && t.isFaulted !== true ? (t.result as T) : undefined;
    };
    located = salvage<BoxLocateResult>(boxLocateTask) ?? { skipped: 'rung_failed' };
    outlook = salvage<OutlookLocateResult>(outlookLocateTask) ?? { skipped: 'rung_failed' };
    if (!ctx.df.isReplaying) {
      ctx.log(`[retro] locate fan-out partial failure (best-effort, salvaged): ${String(e)}`);
    }
  }
  if (!located.skipped) rungsTried.push('box_archive');
  if (!outlook.skipped) rungsTried.push('outlook_search');
  const boxAmbiguity =
    located.candidateCount && located.candidateCount > 1 ? located.candidateCount : undefined;

  // Fetch the archive instruction when a folder was located (identity + material).
  interface BoxFetchResult {
    skipped?: string;
    envelope?: InboundEnvelope;
    instructionSource?: RetroReconstructionSource;
    otherFiles?: Array<{ boxFileId: string; filename: string; size?: number }>;
    subfolderCount?: number;
  }
  let fetched: BoxFetchResult | undefined;
  if (!located.skipped && located.found && located.folder && located.discoveredPo) {
    try {
      const f = (yield ctx.df.callActivityWithRetry('retroBoxFetchInstruction', retry, {
        folderId: located.folder.id,
        folderName: located.folder.name,
        discoveredPo: located.discoveredPo,
        triggerReceivedAt: (trigger as { receivedAt?: string }).receivedAt,
      })) as BoxFetchResult;
      if (!f.skipped && f.envelope) fetched = f;
    } catch (e) {
      if (!ctx.df.isReplaying) {
        ctx.log(`[retro] Box fetch failed (best-effort, falling through): ${String(e)}`);
      }
    }
  }

  const outlookUsable = Boolean(
    !outlook.skipped && outlook.found && outlook.messageId && outlook.resource,
  );
  const plan = planRetroReconstruction({
    box: { skipped: Boolean(located.skipped), found: Boolean(fetched) },
    outlook: { skipped: Boolean(outlook.skipped), found: outlookUsable },
    ...(fetched
      ? {
          boxInstruction: (fetched.instructionSource ?? 'minimal') as
            | 'box_eml'
            | 'box_doc'
            | 'minimal',
        }
      : {}),
  });
  if (!ctx.df.isReplaying) {
    ctx.log(JSON.stringify({ evt: 'retroPlan', arm: plan.arm, reasons: plan.reasons }));
  }

  /* ----------  shared building blocks (local generators — yield* delegated)  ---------- */

  interface PersistResult {
    skipped?: string;
    outcome?: string;
    caseId?: string;
    casePo?: string | null;
    resolvedProviderId?: string;
    providerRecovery?: 'identity_ready' | 'not_needed' | 'blocked';
  }

  /** The record-keeping chain a live arrival gets (TKT-219 parity: classifyPersist WITH
   *  the case VRM + resolved provider so the per-provider AI opt-out holds, extractImages
   *  for embedded instruction images, then statusEvaluate). Runs for created AND
   *  already_exists_linked (a replayed get-or-create is still a record-keeping seam).
   *  `ensureArchiveFolder` is the Outlook-only arm's identity-recovery folder ensure. */
  function* finishPersisted(args: {
    persisted: PersistResult;
    original: InboundEnvelope;
    parseResult: RetroParseResult;
    source: RetroReconstructionSource;
    caseVrm: string;
    principalForStems: string;
    ensureArchiveFolder: boolean;
  }): Generator<Task, string, never> {
    const caseId = args.persisted.caseId as string;
    const workProviderIdForEvidence = args.persisted.resolvedProviderId ?? providerId;
    if (args.source !== 'minimal') {
      try {
        yield ctx.df.callActivityWithRetry('classifyPersist', retry, {
          caseId,
          inbound: args.original,
          typings: (args.parseResult as { attachmentTypings?: unknown }).attachmentTypings,
          ...(args.caseVrm ? { caseVrm: args.caseVrm } : {}),
          ...(workProviderIdForEvidence ? { workProviderId: workProviderIdForEvidence } : {}),
        });
      } catch (e) {
        if (!ctx.df.isReplaying) {
          ctx.log(`[retro] classifyPersist failed (additive, non-blocking): ${String(e)}`);
        }
      }
      // TKT-219 (G1) — intake step-3.5 parity: embedded images from the reconstructed
      // instruction become image evidence rows (best-effort, exactly like intake).
      try {
        yield ctx.df.callActivityWithRetry('extractImages', retry, {
          caseId,
          messageId: args.original.messageId,
          attachments: args.original.attachments,
          ...(args.caseVrm ? { caseVrm: args.caseVrm } : {}),
          ...(workProviderIdForEvidence ? { workProviderId: workProviderIdForEvidence } : {}),
          ...(args.principalForStems ? { providerPrincipal: args.principalForStems } : {}),
        });
      } catch (e) {
        if (!ctx.df.isReplaying) {
          ctx.log(`[retro] extractImages failed (additive, non-blocking): ${String(e)}`);
        }
      }
    }
    let providerRecoveryOut: string =
      args.persisted.providerRecovery === 'identity_ready'
        ? 'completed'
        : (args.persisted.providerRecovery ?? 'not_needed');
    if (args.ensureArchiveFolder && args.persisted.providerRecovery === 'identity_ready') {
      // A create or exact get-or-create replay can finish provider identity. Run the
      // idempotent folder ensure; the sub-orchestrator proves the exact Case/PO folder is
      // directly under the pinned root before stamping it. Fail-closed: identity says the
      // folder must exist — a pending folder is an orchestration FAILURE, not a shrug.
      let folderResult: { folderId?: string; providerRecoveryCompleted?: boolean };
      try {
        folderResult = (yield ctx.df.callSubOrchestratorWithRetry(
          'boxFolderCreateOrchestrator',
          retry,
          { caseId },
        )) as { folderId?: string; providerRecoveryCompleted?: boolean };
      } catch (e) {
        throw new ProviderArchivePendingError(
          `Archive folder recovery failed for retro case ${caseId}: ${String(e)}`,
        );
      }
      if (!folderResult?.folderId || folderResult.providerRecoveryCompleted !== true) {
        throw new ProviderArchivePendingError(
          `Provider identity is ready but the Archive folder is still pending for retro case ${caseId}`,
        );
      }
      // TKT-220 (G3) — the folder just ensured is WRITABLE (created under the pinned root,
      // unlike the read-only archive of the Box/combined arms), so mirror the linked-reply
      // lane and archive the case's evidence into it (best-effort).
      try {
        yield ctx.df.callActivityWithRetry('boxArchiveEvidence', retry, { caseId });
      } catch (e) {
        if (!ctx.df.isReplaying) {
          ctx.log(`[retro] boxArchiveEvidence failed (additive, non-blocking): ${String(e)}`);
        }
      }
    }
    try {
      yield ctx.df.callActivityWithRetry('statusEvaluate', retry, { caseId });
    } catch (e) {
      if (!ctx.df.isReplaying) {
        ctx.log(`[retro] statusEvaluate failed (additive, non-blocking): ${String(e)}`);
      }
    }
    // TKT-222 (operator directive 2026-07-16) — reconstructing the original is not the whole
    // job: link EVERY related mailbox email for this case's keys (replies, chasers, our own
    // sent responses), bounded and corroborated, never re-pointing an email linked elsewhere.
    // Best-effort: a backfill hiccup never unwinds the created/linked case.
    try {
      const excludeInternetMessageIds = [
        (trigger as { internetMessageId?: string }).internetMessageId,
        args.original.internetMessageId,
      ].filter((v): v is string => Boolean(v));
      const linked = (yield ctx.df.callActivityWithRetry('retroLinkRelated', retry, {
        caseId,
        keys: searchKeys,
        excludeInternetMessageIds,
      })) as { skipped?: string; linked?: number; scanned?: number };
      if (!ctx.df.isReplaying && !linked.skipped) {
        ctx.log(JSON.stringify({ evt: 'retroLinkRelated', caseId, linked: linked.linked, scanned: linked.scanned }));
      }
    } catch (e) {
      if (!ctx.df.isReplaying) {
        ctx.log(`[retro] retroLinkRelated failed (additive, non-blocking): ${String(e)}`);
      }
    }
    return providerRecoveryOut;
  }

  interface OutlookPrepared {
    original: InboundEnvelope;
    parseResult: RetroParseResult;
    parserEva: ParserEvaFields;
    parserVrm: string;
    parserRef: string;
    parserMileage: string;
    parserMileageUnit: string;
    corroborated: boolean;
    contradicted: boolean;
  }

  /** Fetch + parse the located Outlook original and evaluate its corroboration against
   *  the trigger keys ($search relevance can surface thread noise): the key must appear
   *  literally in the message text, or the parsed reference / VRM must agree. The
   *  contradiction flag mirrors the Box arm's demotion rule (BOTH ref and VRM parsed and
   *  BOTH disagree → the located material is suspect). */
  function* prepareOutlookOriginal(): Generator<Task, OutlookPrepared, never> {
    const original = (yield ctx.df.callActivityWithRetry('fetchMessage', retry, {
      messageId: outlook.messageId,
      resource: outlook.resource,
    })) as InboundEnvelope;

    let parseResult: RetroParseResult = {};
    try {
      const parseAttachments =
        original.attachments.length > 0
          ? original.attachments
          : original.rawEml
            ? [original.rawEml]
            : [];
      parseResult = (yield ctx.df.callActivityWithRetry('parse', retry, {
        messageId: original.messageId,
        attachments: parseAttachments,
        providerHint: providerPrincipal,
      })) as RetroParseResult;
    } catch (e) {
      if (!ctx.df.isReplaying) {
        ctx.log(`[retro] outlook parse failed (best-effort): ${String(e)}`);
      }
      parseResult = {};
    }
    const mapped = mapRetroParse(
      parseResult,
      String(original.body ?? ''),
      original.internetMessageId || original.messageId,
    );
    const haystack = normToken(`${original.subject}\n${original.body ?? ''}`);
    const keyInText = [searchKeys.casePo, searchKeys.externalRef, searchKeys.vrm, searchKeys.claimant]
      .filter((k): k is string => Boolean(k))
      .some((k) => haystack.includes(normToken(k)));
    const refAgrees = Boolean(
      searchKeys.externalRef &&
        mapped.parserRef &&
        normToken(mapped.parserRef) === normToken(searchKeys.externalRef),
    );
    const vrmAgrees = Boolean(
      searchKeys.vrm &&
        (mapped.parserVrm || original.candidateVrm) &&
        normToken(mapped.parserVrm || original.candidateVrm) === normToken(searchKeys.vrm),
    );
    const refContradicts = Boolean(
      searchKeys.externalRef &&
        mapped.parserRef &&
        normToken(mapped.parserRef) !== normToken(searchKeys.externalRef),
    );
    const vrmContradicts = Boolean(
      searchKeys.vrm &&
        (mapped.parserVrm || original.candidateVrm) &&
        normToken(mapped.parserVrm || original.candidateVrm) !== normToken(searchKeys.vrm),
    );
    return {
      original,
      parseResult,
      ...mapped,
      corroborated: keyInText || refAgrees || vrmAgrees,
      contradicted: refContradicts && vrmContradicts,
    };
  }

  /** The minimal-anchor create (folder identity, no material). Returns the terminal
   *  result object, or null when the create could not land (fall to the failure record). */
  function* createMinimalAnchor(): Generator<Task, Record<string, unknown> | null, never> {
    if (!fetched?.envelope || !located.folder || !located.discoveredPo) return null;
    const original = fetched.envelope;
    const statusDecision = decideRetroStatus({
      triggerCategory: category ?? 'other',
      reconstruction: 'minimal',
      principalResolved: Boolean(located.principalCode),
      casePoKnown: true,
    });
    const persisted = (yield ctx.df.callActivityWithRetry('retroCreatePersist', retry, {
      original,
      trigger,
      keys: searchKeys,
      casePo: located.discoveredPo,
      vrm: original.candidateVrm || searchKeys.vrm || '',
      statusName: statusDecision.status,
      onHold: statusDecision.onHold,
      actionReason: statusDecision.actionReason,
      reconstructionSource: 'minimal',
      providerId,
      intermediary,
      caseType: located.marker ? markerToCaseType(located.marker) : 'standard',
      caseTypeSignals: located.marker
        ? [`archive_marker:${located.marker}`, ...statusDecision.signals]
        : [...statusDecision.signals],
      boxFolder: {
        id: located.folder.id,
        url: `https://app.box.com/folder/${encodeURIComponent(located.folder.id)}`,
      },
      triggerCategory: category,
      otherFiles: fetched.otherFiles ?? [],
    })) as PersistResult;
    if (persisted.skipped) return { outcome: 'skipped', reason: persisted.skipped };
    if (persisted.outcome === 'gated_off') return { outcome: 'skipped', reason: 'api_gate_off' };
    if (persisted.outcome === 'refused_category') return null;
    if (persisted.outcome === 'ambiguous') {
      return { outcome: 'ambiguous', candidateCount: (persisted as { candidateCount?: number }).candidateCount };
    }
    if (
      (persisted.outcome === 'created' || persisted.outcome === 'already_exists_linked') &&
      persisted.caseId
    ) {
      yield* finishPersisted({
        persisted,
        original,
        parseResult: {},
        source: 'minimal',
        caseVrm: original.candidateVrm || searchKeys.vrm || '',
        principalForStems: located.principalCode ?? '',
        ensureArchiveFolder: false,
      });
    }
    return {
      outcome: persisted.outcome,
      caseId: persisted.caseId,
      casePo: persisted.casePo,
      source: 'minimal',
    };
  }

  /** The Outlook-material create: `withBoxIdentity` = the COMBINED arm (Box-discovered
   *  Case/PO + archive folder stamped; TKT-219's replacement for the data-empty anchor);
   *  otherwise the classic Outlook-only Held create. Returns the terminal result object,
   *  or null to fall through (uncorroborated / refused / unusable). */
  function* createFromOutlook(
    withBoxIdentity: boolean,
  ): Generator<Task, Record<string, unknown> | null, never> {
    let prep: OutlookPrepared;
    try {
      prep = (yield* prepareOutlookOriginal()) as OutlookPrepared;
    } catch (e) {
      if (!ctx.df.isReplaying) {
        ctx.log(`[retro] Outlook original fetch/parse failed (best-effort): ${String(e)}`);
      }
      return null;
    }
    if (!prep.corroborated || prep.contradicted) {
      if (!ctx.df.isReplaying) {
        ctx.log(
          `[retro] outlook hit ${prep.contradicted ? 'contradicted' : 'uncorroborated'} (key not in message; parse disagrees) — not used`,
        );
      }
      rungsTried.push(prep.contradicted ? 'outlook_contradicted' : 'outlook_uncorroborated');
      return null;
    }

    const contentType = decideCaseType({
      parserCaseType: (prep.parseResult as {
        case_type?: { value?: string | null; dual?: boolean; signals?: string[] };
      }).case_type,
      parserAudit: (prep.parseResult as {
        audit?: { value?: boolean; signals?: string[] };
      }).audit,
      classifierSubtype: subtype,
    });
    const boxIdentity = withBoxIdentity && located.folder && located.discoveredPo;
    // The archive marker stays ground truth when the Box identity is in play (ADR-0021/0022).
    const caseType = boxIdentity && located.marker ? markerToCaseType(located.marker) : contentType.caseType;
    const statusDecision = decideRetroStatus({
      triggerCategory: category ?? 'other',
      reconstruction: 'outlook',
      principalResolved: boxIdentity ? Boolean(located.principalCode) : false,
      casePoKnown: Boolean(boxIdentity),
    });
    const persisted = (yield ctx.df.callActivityWithRetry('retroCreatePersist', retry, {
      original: prep.original,
      trigger,
      keys: searchKeys,
      ...(boxIdentity ? { casePo: located.discoveredPo } : {}),
      vrm: prep.parserVrm || prep.original.candidateVrm || searchKeys.vrm || '',
      statusName: statusDecision.status,
      onHold: statusDecision.onHold,
      actionReason: statusDecision.actionReason,
      reconstructionSource: 'outlook',
      providerId,
      intermediary,
      parserVrm: prep.parserVrm,
      parserRef: prep.parserRef,
      parserMileage: prep.parserMileage,
      parserMileageUnit: prep.parserMileageUnit,
      parserEva: prep.parserEva,
      caseType,
      caseTypeSignals: [
        ...(boxIdentity && located.marker ? [`archive_marker:${located.marker}`] : []),
        ...contentType.signals,
        ...statusDecision.signals,
        `outlook_match:${outlook.matchedKey ?? 'unknown'}`,
        ...(boxIdentity ? ['combined_reconstruction'] : []),
      ],
      ...(boxIdentity && located.folder
        ? {
            boxFolder: {
              id: located.folder.id,
              url: `https://app.box.com/folder/${encodeURIComponent(located.folder.id)}`,
            },
          }
        : {}),
      triggerCategory: category,
      otherFiles: boxIdentity ? (fetched?.otherFiles ?? []) : [],
    })) as PersistResult;

    if (persisted.skipped) return { outcome: 'skipped', reason: persisted.skipped };
    if (persisted.outcome === 'gated_off') return { outcome: 'skipped', reason: 'api_gate_off' };
    if (persisted.outcome === 'refused_category') {
      // TKT-119 — the API refused this original (ack/digest family): fall through so the
      // email still gets its visible outcome.
      rungsTried.push('outlook_refused_category');
      return null;
    }
    if (persisted.outcome === 'ambiguous') {
      return { outcome: 'ambiguous', candidateCount: (persisted as { candidateCount?: number }).candidateCount };
    }

    let providerRecoveryOut: string = persisted.providerRecovery ?? 'not_needed';
    if (
      (persisted.outcome === 'created' || persisted.outcome === 'already_exists_linked') &&
      persisted.caseId
    ) {
      providerRecoveryOut = (yield* finishPersisted({
        persisted,
        original: prep.original,
        parseResult: prep.parseResult,
        source: 'outlook',
        caseVrm: prep.parserVrm || prep.original.candidateVrm || searchKeys.vrm || '',
        principalForStems: boxIdentity ? (located.principalCode ?? '') : (providerPrincipal ?? ''),
        // The COMBINED arm already has the archive folder stamped at create; only the
        // Outlook-only arm may need its folder ensured after provider recovery.
        ensureArchiveFolder: !boxIdentity,
      })) as string;
    }
    return {
      outcome: persisted.outcome,
      caseId: persisted.caseId,
      casePo: persisted.casePo,
      source: 'outlook',
      ...(boxIdentity ? { combined: true } : {}),
      providerRecovery: providerRecoveryOut,
    };
  }

  /* ----------  the combination arms (planRetroReconstruction matrix)  ---------- */

  // Arm: box_source — the archive yielded parseable material (today's Box arm).
  if (plan.arm === 'box_source' && fetched?.envelope && located.folder && located.discoveredPo) {
    try {
      const original = fetched.envelope;
      const reconstructionSource: RetroReconstructionSource = fetched.instructionSource ?? 'minimal';

      // parse — the EXISTING activity, same best-effort doctrine as intake step 4 (a
      // total parser outage still creates the case; fields backfillable by staff).
      let parseResult: RetroParseResult = {};
      try {
        const parseAttachments =
          original.attachments.length > 0
            ? original.attachments
            : original.rawEml
              ? [original.rawEml]
              : [];
        parseResult = (yield ctx.df.callActivityWithRetry('parse', retry, {
          messageId: original.messageId,
          attachments: parseAttachments,
          providerHint: located.principalCode,
        })) as RetroParseResult;
      } catch (e) {
        if (!ctx.df.isReplaying) {
          ctx.log(`[retro] parse failed (best-effort, case still created): ${String(e)}`);
        }
        parseResult = {};
      }

      // Pure mappings over checkpointed results — mirrors intake's parser forwarding.
      const { parserEva, parserVrm, parserRef, parserMileage, parserMileageUnit } =
        mapRetroParse(
          parseResult,
          String(original.body ?? ''),
          original.internetMessageId || original.messageId,
        );

      // Corroboration (pure, logged): with BOTH trigger keys present AND both parsed,
      // a double disagreement means the picked folder is suspect — demote to a Held
      // minimal anchor (never terminal on a contradicted match). A ref content-hit is
      // otherwise self-corroborating (the key came from INSIDE this folder's files).
      const refContradicts = Boolean(
        searchKeys.externalRef &&
          parserRef &&
          normToken(parserRef) !== normToken(searchKeys.externalRef),
      );
      const vrmContradicts = Boolean(
        searchKeys.vrm &&
          (parserVrm || original.candidateVrm) &&
          normToken(parserVrm || original.candidateVrm) !== normToken(searchKeys.vrm),
      );
      const contradicted = refContradicts && vrmContradicts;
      const effectiveSource: RetroReconstructionSource = contradicted
        ? 'minimal'
        : reconstructionSource;
      if (contradicted && !ctx.df.isReplaying) {
        ctx.log(
          `[retro] corroboration failed (parsed ref+VRM both disagree with the trigger keys) — demoting to Held anchor`,
        );
      }

      // Case type: the archive marker is ground truth (ADR-0021/0022); content
      // detection is the fallback. Pure over checkpointed values.
      const contentType = decideCaseType({
        parserCaseType: (parseResult as {
          case_type?: { value?: string | null; dual?: boolean; signals?: string[] };
        }).case_type,
        parserAudit: (parseResult as {
          audit?: { value?: boolean; signals?: string[] };
        }).audit,
        classifierSubtype: subtype,
      });
      const caseType = located.marker ? markerToCaseType(located.marker) : contentType.caseType;
      const caseTypeSignals = located.marker
        ? [`archive_marker:${located.marker}`, ...contentType.signals]
        : [...contentType.signals];

      const statusDecision = decideRetroStatus({
        triggerCategory: category ?? 'other',
        reconstruction: effectiveSource,
        principalResolved: Boolean(located.principalCode),
        casePoKnown: true,
      });

      const persisted = (yield ctx.df.callActivityWithRetry('retroCreatePersist', retry, {
        original,
        trigger,
        keys: searchKeys,
        casePo: located.discoveredPo,
        vrm: parserVrm || original.candidateVrm || searchKeys.vrm || '',
        statusName: statusDecision.status,
        onHold: statusDecision.onHold,
        actionReason: statusDecision.actionReason,
        reconstructionSource: effectiveSource,
        providerId,
        intermediary,
        // TKT-220 — a contradicted corroboration means the picked folder's material is
        // suspect: the demoted Held anchor must not carry its parsed fields either.
        parserVrm: contradicted ? '' : parserVrm,
        parserRef: contradicted ? '' : parserRef,
        parserMileage: contradicted ? '' : parserMileage,
        parserMileageUnit: contradicted ? '' : parserMileageUnit,
        parserEva: contradicted ? undefined : parserEva,
        caseType,
        caseTypeSignals: [
          ...caseTypeSignals,
          ...statusDecision.signals,
          ...(contradicted ? ['retro_corroboration_failed'] : []),
        ],
        boxFolder: {
          id: located.folder.id,
          url: `https://app.box.com/folder/${encodeURIComponent(located.folder.id)}`,
        },
        triggerCategory: category,
        otherFiles: fetched.otherFiles ?? [],
      })) as PersistResult;

      if (persisted.skipped) return { outcome: 'skipped', reason: persisted.skipped };
      if (persisted.outcome === 'gated_off') return { outcome: 'skipped', reason: 'api_gate_off' };
      if (persisted.outcome === 'refused_category') {
        // TKT-119 — the API's mint guard refused this original (an ack/digest-family
        // email can never be the case source). TKT-219: the Outlook result is already in
        // hand — fall back to it instead of re-searching (then the failure record).
        rungsTried.push('box_refused_category');
        if (outlookUsable) {
          const viaOutlook = (yield* createFromOutlook(false)) as Record<string, unknown> | null;
          if (viaOutlook) return viaOutlook;
        }
      } else {
        if (
          (persisted.outcome === 'created' || persisted.outcome === 'already_exists_linked') &&
          persisted.caseId
        ) {
          // Record-keeping parity with a linked live arrival (finishPersisted): evidence
          // rows + embedded images + status alignment. NO boxFolderCreate (the ARCHIVE
          // folder was stamped in the create), NO boxArchiveEvidence (RO archive refuses
          // uploads), NO enrich (vehicle data adds nothing here).
          yield* finishPersisted({
            persisted,
            original,
            parseResult,
            source: effectiveSource,
            caseVrm: parserVrm || original.candidateVrm || searchKeys.vrm || '',
            principalForStems: located.principalCode ?? '',
            ensureArchiveFolder: false,
          });
        }
        return {
          outcome: persisted.outcome,
          caseId: persisted.caseId,
          casePo: persisted.casePo,
          source: effectiveSource,
          ...(contradicted ? { corroboration: 'contradicted' } : {}),
        };
      }
    } catch (e) {
      if (e instanceof ProviderArchivePendingError) throw e;
      if (!ctx.df.isReplaying) {
        ctx.log(`[retro] Box arm failed (best-effort, falling through): ${String(e)}`);
      }
      if (outlookUsable) {
        try {
          const viaOutlook = (yield* createFromOutlook(false)) as Record<string, unknown> | null;
          if (viaOutlook) return viaOutlook;
        } catch (e2) {
          if (e2 instanceof ProviderArchivePendingError) throw e2;
          if (!ctx.df.isReplaying) {
            ctx.log(`[retro] Outlook fallback failed (best-effort): ${String(e2)}`);
          }
        }
      }
    }
  }

  // Arm: combined — folder identity + Outlook material (TKT-219). A failed corroboration
  // or refusal degrades to the minimal anchor exactly where the old ladder landed.
  if (plan.arm === 'combined') {
    try {
      const viaCombined = (yield* createFromOutlook(true)) as Record<string, unknown> | null;
      if (viaCombined) return viaCombined;
      const anchored = (yield* createMinimalAnchor()) as Record<string, unknown> | null;
      if (anchored) return anchored;
    } catch (e) {
      if (e instanceof ProviderArchivePendingError) throw e;
      if (!ctx.df.isReplaying) {
        ctx.log(`[retro] combined arm failed (best-effort, falling through): ${String(e)}`);
      }
    }
  }

  // Arm: minimal_anchor — folder identity, nothing parseable anywhere.
  if (plan.arm === 'minimal_anchor') {
    try {
      const anchored = (yield* createMinimalAnchor()) as Record<string, unknown> | null;
      if (anchored) return anchored;
    } catch (e) {
      if (e instanceof ProviderArchivePendingError) throw e;
      if (!ctx.df.isReplaying) {
        ctx.log(`[retro] minimal-anchor arm failed (best-effort, falling through): ${String(e)}`);
      }
    }
  }

  // Arm: outlook_only — no archive folder; the located original stands alone.
  if (plan.arm === 'outlook_only') {
    try {
      const viaOutlook = (yield* createFromOutlook(false)) as Record<string, unknown> | null;
      if (viaOutlook) return viaOutlook;
    } catch (e) {
      if (e instanceof ProviderArchivePendingError) throw e;
      if (!ctx.df.isReplaying) {
        ctx.log(`[retro] Outlook arm failed (best-effort, falling through): ${String(e)}`);
      }
    }
  }

  // Bottom of the ladder: record the attempt so ops can see it; the triage row is left
  // exactly as today (case_id NULL, staff triage) with the visible attention stamp.
  yield ctx.df.callActivityWithRetry('retroRecordFailure', retry, {
    trigger,
    keys: searchKeys,
    triggerCategory: category,
    rungsTried,
    ...(boxAmbiguity ? { ambiguousFolders: boxAmbiguity } : {}),
  });
  return { outcome: 'no_source', ...(boxAmbiguity ? { ambiguousFolders: boxAmbiguity } : {}) };
});
