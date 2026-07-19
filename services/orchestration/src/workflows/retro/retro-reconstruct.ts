/**
 * retro-reconstruct.ts (ADR-0022 / TKT-058 / TKT-219 / TKT-220 / TKT-222 / TKT-225).
 *
 * The reconstruction PERSISTENCE ARMS of the retro ladder: given the located Box archive
 * folder, the fetched archive instruction, and/or the located Outlook original, build the
 * created/linked case and run the SAME record-keeping chain a live arrival gets
 * (classifyPersist WITH the case VRM + resolved provider → extractImages → statusEvaluate),
 * then backfill every related mailbox email (retroLinkRelated + the related-ingest child).
 *
 * These generators are the local building blocks the retroCaseOrchestrator (retro-case.ts)
 * used to close over; they are extracted here (TKT-210) with the shared orchestrator state
 * threaded through an explicit {@link RetroReconstructContext} instead of a closure. Pure
 * over checkpointed activity results — yield* delegation preserves the Durable replay order
 * exactly, so behaviour is identical to the inlined form.
 */

import type { OrchestrationContext, RetryOptions, Task } from 'durable-functions';
import {
  decideCaseType,
  decideRetroStatus,
  markerToCaseType,
  type InboundCategory,
  type RetroKeys,
  type RetroReconstructionSource,
} from '@cs/domain';
import type { ParserEvaFields } from '../../adapters/data-api.js';
import type { InboundEnvelope } from '../intake/fetchMessage.js';
import {
  buildMinimalAnchorEnvelope,
  relatedParseContradictsKeys,
  type RetroTriggerIdentity,
} from './retro-envelope.js';
import { mapRetroParse, type RetroParseResult } from './retro-parse-map.js';

/** Thrown when provider identity is ready but the WRITABLE archive folder is still pending
 *  (fail-closed): it propagates out of the orchestrator to FAIL the run so Durable retries,
 *  rather than silently landing a case without its recovered folder. */
export class ProviderArchivePendingError extends Error {}

/** Case-insensitive whitespace-collapsed token normalisation for corroboration. */
function normToken(v: string): string {
  return v.trim().toUpperCase().replace(/\s+/g, '');
}

/** The retroBoxLocate activity result as the reconstruction arms consume it. */
export interface BoxLocateResult {
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

/** The retroOutlookLocate activity result (with the ranked candidate shortlist). */
export interface OutlookLocateResult {
  skipped?: string;
  found?: boolean;
  messageId?: string;
  resource?: string;
  mailbox?: string;
  matchedKey?: string;
  /** PR-review fix (CHANGE 6) — the external_ref pick's provider corroboration
   *  ('mismatch' candidates were dropped inside the activity), audit-stamped below. */
  providerCorroboration?: 'agreed' | 'same_domain' | 'unknown';
  /** TKT-219 follow-up — the ranked shortlist for candidate fallback. */
  candidates?: Array<{ messageId: string; mailbox: string; resource: string }>;
}

/** The retroBoxFetchInstruction activity result (the recovered archive instruction). */
export interface BoxFetchResult {
  skipped?: string;
  envelope?: InboundEnvelope;
  instructionSource?: RetroReconstructionSource;
  otherFiles?: Array<{ boxFileId: string; filename: string; size?: number }>;
  subfolderCount?: number;
}

interface PersistResult {
  skipped?: string;
  outcome?: string;
  caseId?: string;
  casePo?: string | null;
  /** Set on refused_category — the located original's blocking classification. */
  category?: string;
  resolvedProviderId?: string;
  providerRecovery?: 'identity_ready' | 'not_needed' | 'blocked';
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

/**
 * The shared reconstruction context the orchestrator threads into every persistence arm.
 * All values are checkpointed activity results / caller facts (the arms are pure over
 * them), plus the two by-reference accumulators (`rungsTried` / `refusedOriginals`) the
 * orchestrator reads back for its bottom-of-ladder failure record.
 */
export interface RetroReconstructContext {
  ctx: OrchestrationContext;
  retry: RetryOptions;
  trigger: unknown;
  category: InboundCategory | undefined;
  subtype: string | undefined;
  searchKeys: RetroKeys;
  providerId: string | undefined;
  providerPrincipal: string | undefined;
  intermediary: { imageSourceId: string; candidateProviderIds: string[] } | undefined;
  triggerIdentity: RetroTriggerIdentity;
  located: BoxLocateResult;
  fetched: BoxFetchResult | undefined;
  outlook: OutlookLocateResult;
  outlookUsable: boolean;
  rungsTried: string[];
  refusedOriginals: Array<{ internetMessageId: string; category: string }>;
}

/** The record-keeping chain a live arrival gets (TKT-219 parity: classifyPersist WITH
 *  the case VRM + resolved provider so the per-provider AI opt-out holds, extractImages
 *  for embedded instruction images, then statusEvaluate). Runs for created AND
 *  already_exists_linked (a replayed get-or-create is still a record-keeping seam).
 *  `ensureArchiveFolder` is the Outlook-only arm's identity-recovery folder ensure. */
export function* finishPersisted(
  rc: RetroReconstructContext,
  args: {
    persisted: PersistResult;
    original: InboundEnvelope;
    parseResult: RetroParseResult;
    source: RetroReconstructionSource;
    caseVrm: string;
    principalForStems: string;
    ensureArchiveFolder: boolean;
  },
): Generator<Task, string, never> {
  const { ctx, retry, providerId, trigger, searchKeys, triggerIdentity } = rc;
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
    // TKT-225 (D8) — remembers whether this arm archived into a freshly ensured WRITABLE
    // folder, so the related-ingest below can re-mirror its new evidence once (idempotent).
    let archivedToWritableFolder = false;
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
      archivedToWritableFolder = true;
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
    let backfillStage = 'retroLinkRelated';
    try {
      const excludeInternetMessageIds = [
        (trigger as { internetMessageId?: string }).internetMessageId,
        args.original.internetMessageId,
      ].filter((v): v is string => Boolean(v));
      const linked = (yield ctx.df.callActivityWithRetry('retroLinkRelated', retry, {
        caseId,
        keys: searchKeys,
        excludeInternetMessageIds,
        // PR-review fix (CHANGE 6) — the checkpointed trigger identity for the weak-key
        // corroboration of third-party related candidates.
        trigger: triggerIdentity,
      })) as {
        skipped?: string;
        linked?: number;
        scanned?: number;
        /** PR-review fix — the route's own 25-new-links cap, surfaced (never silent). */
        skippedByCap?: number;
        weakUncorroborated?: number;
        ingestRows?: Array<{
          internetMessageId: string;
          messageId: string;
          resource: string;
          mailbox: string;
          receivedAt: string;
        }>;
      };
      if (!ctx.df.isReplaying && !linked.skipped) {
        ctx.log(JSON.stringify({
          evt: 'retroLinkRelated', caseId, linked: linked.linked, scanned: linked.scanned,
          skippedByCap: linked.skippedByCap, weakUncorroborated: linked.weakUncorroborated,
        }));
      }
      // TKT-225 — the initial reconstruction is like receiving a new case: each linked
      // related email is INGESTED like a new intake (attachments → evidence, embedded
      // images, parser fields fill-gaps). `ingestRows` is present ONLY when the activity
      // read RETRO_RELATED_INGEST_ENABLED on — the gate decision is checkpointed, so this
      // branch is pure over activity results (gate off = byte-identical TKT-222 v1 run).
      if (linked.ingestRows && linked.ingestRows.length > 0) {
        backfillStage = 'retroRelatedIngestOrchestrator';
        const ingest = (yield ctx.df.callSubOrchestratorWithRetry('retroRelatedIngestOrchestrator', retry, {
          caseId,
          rows: linked.ingestRows,
          keys: searchKeys,
          ...(args.caseVrm ? { caseVrm: args.caseVrm } : {}),
          ...(workProviderIdForEvidence ? { workProviderId: workProviderIdForEvidence } : {}),
          ...(args.principalForStems ? { providerPrincipal: args.principalForStems } : {}),
        })) as { processed?: number; failed?: number; fieldsApplied?: number };
        if (!ctx.df.isReplaying) {
          ctx.log(JSON.stringify({ evt: 'retroRelatedIngest', caseId, ...ingest }));
        }
        // D8 — Outlook-only arm: the writable folder already received boxArchiveEvidence
        // above; re-run once (idempotent) so the ingested evidence mirrors too. The RO
        // Box/combined arms stay untouched (uploads refused by design).
        if (archivedToWritableFolder) {
          try {
            yield ctx.df.callActivityWithRetry('boxArchiveEvidence', retry, { caseId });
          } catch (e) {
            if (!ctx.df.isReplaying) {
              ctx.log(`[retro] post-ingest boxArchiveEvidence failed (additive, non-blocking): ${String(e)}`);
            }
          }
        }
      }
    } catch (e) {
      if (!ctx.df.isReplaying) {
        ctx.log(`[retro] ${backfillStage} failed (additive, non-blocking): ${String(e)}`);
      }
    }
    return providerRecoveryOut;
}

/** Fetch + parse the located Outlook original and evaluate its corroboration against
 *  the trigger keys ($search relevance can surface thread noise): the key must appear
 *  literally in the message text, or the parsed reference / VRM must agree. The
 *  contradiction flag mirrors the Box arm's demotion rule (BOTH ref and VRM parsed and
 *  BOTH disagree → the located material is suspect). */
export function* prepareOutlookOriginal(
  rc: RetroReconstructContext,
  target: { messageId: string; resource: string },
): Generator<Task, OutlookPrepared, never> {
  const { ctx, retry, providerPrincipal, searchKeys } = rc;
    const original = (yield ctx.df.callActivityWithRetry('fetchMessage', retry, {
      messageId: target.messageId,
      resource: target.resource,
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
    return {
      original,
      parseResult,
      ...mapped,
      corroborated: keyInText || refAgrees || vrmAgrees,
      // TKT-225 — the shared demotion rule (BOTH ref and VRM parsed and BOTH disagree),
      // extracted so the related-ingest child applies exactly the same contradiction test.
      contradicted: relatedParseContradictsKeys(
        searchKeys,
        mapped.parserRef,
        mapped.parserVrm,
        original.candidateVrm,
      ),
    };
}

/** The minimal-anchor create (folder identity, no material). Returns the terminal
 *  result object, or null when the create could not land (fall to the failure record). */
export function* createMinimalAnchor(
  rc: RetroReconstructContext,
): Generator<Task, Record<string, unknown> | null, never> {
  const { ctx, retry, located, fetched, trigger, category, searchKeys, providerId, intermediary } = rc;
    if (!located.folder || !located.discoveredPo) return null;
    // PR-review fix (CHANGE 9, F15) — a located folder whose instruction fetch faulted
    // still anchors: synthesize the deterministic folder-keyed envelope here. Replay-safe
    // time: the checkpointed trigger receivedAt, else Durable's orchestration clock
    // (ctx.df.currentUtcDateTime — NEVER Date.now in an orchestrator body).
    const original =
      fetched?.envelope ??
      buildMinimalAnchorEnvelope(
        {
          receivedAt:
            (trigger as { receivedAt?: string }).receivedAt ??
            ctx.df.currentUtcDateTime.toISOString(),
        },
        located.discoveredPo,
        located.folder.id,
      );
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
      otherFiles: fetched?.otherFiles ?? [],
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
      yield* finishPersisted(rc, {
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
export function* createFromOutlook(
  rc: RetroReconstructContext,
  withBoxIdentity: boolean,
): Generator<Task, Record<string, unknown> | null, never> {
  const {
    ctx,
    retry,
    outlook,
    located,
    fetched,
    category,
    subtype,
    searchKeys,
    trigger,
    providerId,
    providerPrincipal,
    intermediary,
    rungsTried,
    refusedOriginals,
  } = rc;
    // TKT-219 follow-up (candidate fallback): a refused or uncorroborated first pick must
    // not sink the arm when the real original ranks just below it — the WF69NDX live shape
    // was exactly a blocked-family sibling outranking the genuine instruction. Try the
    // ranked shortlist in order (retroOutlookLocate caps it at 3).
    const shortlist =
      outlook.candidates && outlook.candidates.length > 0
        ? outlook.candidates
        : outlook.messageId && outlook.resource
          ? [{ messageId: outlook.messageId, mailbox: outlook.mailbox ?? '', resource: outlook.resource }]
          : [];
    for (const outlookCandidate of shortlist) {
    let prep: OutlookPrepared;
    try {
      prep = (yield* prepareOutlookOriginal(rc, outlookCandidate)) as OutlookPrepared;
    } catch (e) {
      if (!ctx.df.isReplaying) {
        ctx.log(`[retro] Outlook original fetch/parse failed (best-effort, next candidate): ${String(e)}`);
      }
      continue;
    }
    if (!prep.corroborated || prep.contradicted) {
      if (!ctx.df.isReplaying) {
        ctx.log(
          `[retro] outlook hit ${prep.contradicted ? 'contradicted' : 'uncorroborated'} (key not in message; parse disagrees) — next candidate`,
        );
      }
      rungsTried.push(prep.contradicted ? 'outlook_contradicted' : 'outlook_uncorroborated');
      continue;
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
        // PR-review fix (CHANGE 6) — the external_ref pick's provider corroboration,
        // audit-visible on the created case.
        ...(outlook.providerCorroboration
          ? [`outlook_provider:${outlook.providerCorroboration}`]
          : []),
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
      // TKT-119 — the API refused this original (ack/digest family). TKT-219 follow-up:
      // remember it for the failure record, then try the next ranked candidate.
      refusedOriginals.push({
        internetMessageId: prep.original.internetMessageId,
        category: persisted.category ?? 'unknown',
      });
      rungsTried.push('outlook_refused_category');
      continue;
    }
    if (persisted.outcome === 'ambiguous') {
      return { outcome: 'ambiguous', candidateCount: (persisted as { candidateCount?: number }).candidateCount };
    }

    let providerRecoveryOut: string = persisted.providerRecovery ?? 'not_needed';
    if (
      (persisted.outcome === 'created' || persisted.outcome === 'already_exists_linked') &&
      persisted.caseId
    ) {
      providerRecoveryOut = (yield* finishPersisted(rc, {
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
    return null; // shortlist exhausted — the ladder falls to its visible failure record
}

/** Arm: box_source — the archive yielded parseable material. Fetch + parse the archive
 *  instruction, corroborate against the trigger keys (a double ref+VRM disagreement demotes
 *  to a Held minimal anchor), then persist via retroCreatePersist and run the record-keeping
 *  chain. A refusal or fault falls back to the Outlook material, keeping the Box identity.
 *  Returns the terminal result object, or null to fall through to the failure record. */
export function* createFromBox(
  rc: RetroReconstructContext,
): Generator<Task, Record<string, unknown> | null, never> {
  const {
    ctx,
    retry,
    fetched,
    located,
    subtype,
    category,
    searchKeys,
    trigger,
    providerId,
    intermediary,
    outlookUsable,
    rungsTried,
    refusedOriginals,
  } = rc;
  if (!fetched?.envelope || !located.folder || !located.discoveredPo) return null;
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
        refusedOriginals.push({
          internetMessageId: original.internetMessageId,
          category: persisted.category ?? 'unknown',
        });
        rungsTried.push('box_refused_category');
        if (outlookUsable) {
          // PR-review fix (CHANGE 9, F18) — the fallback keeps the Box IDENTITY (casePo +
          // archive folder): box_source arm entry guarantees located.folder +
          // located.discoveredPo, which is all createFromOutlook(true) needs.
          const viaOutlook = (yield* createFromOutlook(rc, true)) as Record<string, unknown> | null;
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
          yield* finishPersisted(rc, {
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
          // PR-review fix (CHANGE 9, F18) — the catch fallback keeps the Box identity too
          // (same guarantee: the arm ran only with located.folder + located.discoveredPo).
          const viaOutlook = (yield* createFromOutlook(rc, true)) as Record<string, unknown> | null;
          if (viaOutlook) return viaOutlook;
        } catch (e2) {
          if (e2 instanceof ProviderArchivePendingError) throw e2;
          if (!ctx.df.isReplaying) {
            ctx.log(`[retro] Outlook fallback failed (best-effort): ${String(e2)}`);
          }
        }
      }
    }
  return null;
}
