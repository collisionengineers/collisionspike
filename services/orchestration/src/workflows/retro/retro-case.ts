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
  decideRetro,
  hasUsableRetroKey,
  planRetroReconstruction,
  type InboundCategory,
  type RetroKeys,
} from '@cs/domain';
import { supplementClaimantNameFromBody } from '../../platform/supplement-parse.js';
import type { InboundEnvelope } from '../intake/fetchMessage.js';
import type { InboundClassification } from '../intake/classifyInbound.js';
import type { RetroTriggerIdentity } from './retro-envelope.js';
import {
  ProviderArchivePendingError,
  createFromBox,
  createFromOutlook,
  createMinimalAnchor,
  type BoxFetchResult,
  type BoxLocateResult,
  type OutlookLocateResult,
  type RetroReconstructContext,
} from './retro-reconstruct.js';

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
    // PR-review fix (CHANGE 10) — force is SCOPED to the failure family: the prior
    // instance's recorded output decides. A Completed run whose outcome created or linked
    // a case ('created' / 'linked' / 'already_exists_linked') is finished business — the
    // caller gets the prior outcome back instead of a re-drive. Everything else
    // (trigger_not_found / no_source / not_eligible / ambiguous / skipped / bad_input —
    // the complement of the success family) stays force-restartable.
    const isLive = runtimeStatus === 'Running' || runtimeStatus === 'Pending';
    let priorOutcome: string | undefined;
    let isRestartable = runtimeStatus === 'Failed' || runtimeStatus === 'Terminated';
    if (!isRestartable && !isLive && runtimeStatus === 'Completed' && input.force === true) {
      const out = existing?.output as { outcome?: unknown } | null | undefined;
      priorOutcome =
        out && typeof out === 'object' && typeof out.outcome === 'string'
          ? out.outcome
          : undefined;
      const succeeded =
        priorOutcome === 'created' ||
        priorOutcome === 'linked' ||
        priorOutcome === 'already_exists_linked';
      isRestartable = !succeeded;
    }
    if (runtimeStatus && (isLive || !isRestartable)) {
      ctx.log(
        `[retro-case] instance ${instanceId} already ${runtimeStatus}` +
          (priorOutcome ? ` (outcome ${priorOutcome})` : '') +
          ' — not restarted',
      );
      return {
        status: 200,
        jsonBody: {
          instanceId,
          deduped: true,
          runtimeStatus,
          ...(priorOutcome ? { outcome: priorOutcome } : {}),
        },
      };
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
          // PR-review fix (CHANGE 2) — scope the attention stamp's UPDATE to the drain
          // row's stored mailbox.
          ...(input.mailbox ? { sourceMailbox: input.mailbox } : {}),
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
      // TKT-230 (item 7) — a drain trigger the LIVE classifier re-labelled receiving_work is
      // an instruction sitting un-cased. classifyInbound has already PERSISTED that
      // classification itself (classifyInbound → recordInboundEmail — this early return
      // discards only the retro DECISION, never the label), so give the row the VISIBLE
      // failure home (the unable_to_locate attention chip) instead of a silent not_eligible.
      // Best-effort: the stamp can never alter the returned outcome. Never auto-mint.
      if (classification.category === 'receiving_work') {
        try {
          yield ctx.df.callActivityWithRetry('retroRecordFailure', retry, {
            trigger,
            keys: decision.keys ?? {},
            triggerCategory: classification.category,
            rungsTried: ['eligibility'],
            // PR-review fix (CHANGE 2) — the drain row's stored mailbox scopes the stamp.
            ...(input.mailbox ? { sourceMailbox: input.mailbox } : {}),
          });
        } catch (e) {
          if (!ctx.df.isReplaying) {
            ctx.log(`[retro] not_eligible stamp failed (best-effort): ${String(e)}`);
          }
        }
      }
      return { outcome: 'not_eligible', reasons: decision.reasons };
    }
    keys = decision.keys;
  }

  // PR-review fix (CHANGE 2) — the failure stamp's mailbox scope, pure over checkpointed
  // facts: the drain row's stored mailbox when driven manually, else the trigger
  // envelope's own source mailbox (the intake path's checkpointed fetch).
  const failureSourceMailbox =
    input.mailbox ?? (trigger as { sourceMailbox?: string }).sourceMailbox;

  if (!hasUsableRetroKey(keys)) {
    // TKT-230 (item 7) — the analogous visible-home guard on the keyless return; `category`
    // here is checkpointed from the classify activity (drain path) or the caller (intake
    // path). Best-effort; the outcome is unchanged either way.
    if (category === 'receiving_work') {
      try {
        yield ctx.df.callActivityWithRetry('retroRecordFailure', retry, {
          trigger,
          keys: keys ?? {},
          triggerCategory: category,
          rungsTried: ['eligibility'],
          ...(failureSourceMailbox ? { sourceMailbox: failureSourceMailbox } : {}),
        });
      } catch (e) {
        if (!ctx.df.isReplaying) {
          ctx.log(`[retro] no_usable_key stamp failed (best-effort): ${String(e)}`);
        }
      }
    }
    return { outcome: 'not_eligible', reasons: ['no_usable_key'] };
  }
  const searchKeys = keys as RetroKeys;

  // PR-review fix (CHANGE 6) — the trigger's sender identity, pure over checkpointed
  // facts (the envelope from the caller / fetchMessage; providerId + intermediary from
  // providerMatch): threaded into the Outlook search activities so weak-keyed candidates
  // are provider-corroborated exactly as the Box weak-key rule requires.
  const triggerSenderAddress = (trigger as { senderAddress?: string }).senderAddress;
  const triggerIdentity: RetroTriggerIdentity = {
    ...(triggerSenderAddress ? { senderAddress: triggerSenderAddress } : {}),
    ...(providerId ? { providerId } : {}),
    ...(intermediary && intermediary.candidateProviderIds.length > 0
      ? { intermediaryCandidateProviderIds: intermediary.candidateProviderIds }
      : {}),
  };

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
    // the trigger's own attachments become evidence and status realigns (all best-effort).
    // TKT-230 (item 6) — the D8 doctrine now extends to rung 1 via the checkpointed
    // retroCaseFolderWritable probe below: evidence mirrors ONLY into a folder proven
    // writable (a live-intake folder under the pinned root); folders under the read-only
    // archive roots stay untouched (uploads refused by design). Gates are read INSIDE the
    // probe activity; this orchestrator branches only on its checkpointed result.
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
        // TKT-230 (item 6) — mirror fresh rung-1 evidence into a WRITABLE folder only.
        // boxArchiveEvidence is idempotent, so re-runs are safe; the whole block stays
        // inside this best-effort try so a probe/mirror failure never unwinds the link.
        const writable = (yield ctx.df.callActivityWithRetry('retroCaseFolderWritable', retry, {
          caseId: resolved.caseId,
        })) as { writable: boolean; reason?: string };
        if (writable.writable) {
          yield ctx.df.callActivityWithRetry('boxArchiveEvidence', retry, {
            caseId: resolved.caseId,
          });
        }
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
    trigger: triggerIdentity,
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
  // PR-review fix (CHANGE 9, F15) — the Box IDENTITY (folder + discovered PO) counts as
  // located even when the instruction FETCH faulted or was skipped: a fetch hiccup must
  // not discard a real archive identity. A located-but-unfetched folder plans exactly as
  // a located-but-unparseable one ('minimal' instruction → combined / minimal_anchor).
  const boxLocated = Boolean(
    !located.skipped && located.found && located.folder && located.discoveredPo,
  );
  const plan = planRetroReconstruction({
    box: { skipped: Boolean(located.skipped), found: boxLocated },
    outlook: { skipped: Boolean(outlook.skipped), found: outlookUsable },
    ...(boxLocated
      ? {
          boxInstruction: (fetched ? (fetched.instructionSource ?? 'minimal') : 'minimal') as
            | 'box_eml'
            | 'box_doc'
            | 'minimal',
        }
      : {}),
  });
  if (!ctx.df.isReplaying) {
    ctx.log(JSON.stringify({ evt: 'retroPlan', arm: plan.arm, reasons: plan.reasons }));
  }

  // TKT-219 follow-up (surfacing): every found-but-refused original is remembered so the
  // failure record can tell staff a candidate EXISTS and what blocks it (review/reclassify).
  const refusedOriginals: Array<{ internetMessageId: string; category: string }> = [];

  // The reconstruction context threaded into the persistence arms (retro-reconstruct.ts):
  // checkpointed activity results / caller facts the arms are pure over, plus the two
  // by-reference accumulators (rungsTried / refusedOriginals) read back for the failure
  // record below. yield* delegation preserves the Durable replay order exactly.
  const rc: RetroReconstructContext = {
    ctx,
    retry,
    trigger,
    category,
    subtype,
    searchKeys,
    providerId,
    providerPrincipal,
    intermediary,
    triggerIdentity,
    located,
    fetched,
    outlook,
    outlookUsable,
    rungsTried,
    refusedOriginals,
  };

  /* ----------  the combination arms (planRetroReconstruction matrix)  ---------- */

  // Arm: box_source — the archive yielded parseable material (today's Box arm).
  if (plan.arm === 'box_source' && fetched?.envelope && located.folder && located.discoveredPo) {
    const viaBox = (yield* createFromBox(rc)) as Record<string, unknown> | null;
    if (viaBox) return viaBox;
  }

  // Arm: combined — folder identity + Outlook material (TKT-219). A failed corroboration
  // or refusal degrades to the minimal anchor exactly where the old ladder landed.
  if (plan.arm === 'combined') {
    try {
      const viaCombined = (yield* createFromOutlook(rc, true)) as Record<string, unknown> | null;
      if (viaCombined) return viaCombined;
      const anchored = (yield* createMinimalAnchor(rc)) as Record<string, unknown> | null;
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
      const anchored = (yield* createMinimalAnchor(rc)) as Record<string, unknown> | null;
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
      const viaOutlook = (yield* createFromOutlook(rc, false)) as Record<string, unknown> | null;
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
    ...(failureSourceMailbox ? { sourceMailbox: failureSourceMailbox } : {}),
    ...(boxAmbiguity ? { ambiguousFolders: boxAmbiguity } : {}),
    ...(refusedOriginals.length > 0 ? { refusedOriginals } : {}),
  });
  return { outcome: 'no_source', ...(boxAmbiguity ? { ambiguousFolders: boxAmbiguity } : {}) };
});
