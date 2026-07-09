/**
 * orchestration/src/functions/gated/retro-case.ts — retro case reconstruction
 * (ADR-0022 / TKT-058).
 *
 * The SECONDARY, gated fallback behind the primary intake: when a billing /
 * case_update / cancellation / query email matches NO case (linkReply is
 * open-cases-only and non-replies never even try), this sub-orchestration runs
 * the reconstruction ladder:
 *
 *   rung 1  retroResolveExisting — ANY-status existence check (incl. terminals)
 *           via the Data API; a hit LINKS the trigger email and stops.  [R1]
 *   rung 2  Box archive — content-search the READ-ONLY archive root(s) by the
 *           email's keys, consolidate hits to ONE case folder (never guess),
 *           discover the Case/PO from the folder name, download + explode the
 *           original instruction `.eml` (or document), land the bytes in Blob,
 *           and run the SAME parse → create chain as live intake.        [R2]
 *   rung 3  Outlook $search — find the original instruction in the 3 scoped
 *           mailboxes.                                          [R3 — not built]
 *   bottom  minimal Held anchor when the folder exists but nothing parseable;
 *           nothing at all → audit retro_reconstruction_failed; the triage row
 *           is left exactly as today.
 *
 * Gates: RETRO_CASE_ENABLED (+ BOX_API_ENABLED + RETRO_BOX_ARCHIVE_ROOT_IDS for
 * the Box rung) — read INSIDE the activities (never the orchestrator body; the
 * parse/enrich/boxFolderCreate convention) so decisions are recorded in Durable
 * history and stay replay-safe. Gate off → honest { skipped } no-ops. The Data
 * API enforces RETRO_CASE_ENABLED server-side too (set it on BOTH apps).
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
import { gates } from '@cs/domain/gates';
import {
  CASE_PO_SHAPE_RE,
  decideCaseType,
  decideRetro,
  decideRetroStatus,
  markerToCaseType,
  matchPrincipalByCasePo,
  normalizeCasePo,
  selectBoxInstructionCandidate,
  type BoxFolderEntry,
  type InboundCategory,
  type RetroKeys,
  type RetroReconstructionSource,
} from '@cs/domain';
import { dataApi, type ParserEvaFields } from '../../lib/data-api.js';
import { findMessageByInternetMessageId, kqlPhrase, searchMessages } from '../../lib/graph.js';
import { intakeMailboxes } from '../../lib/subscriptions.js';
import { box, callExplodeEml, type ExplodedEml } from '../../lib/functions-client.js';
import { uploadEvidenceBytes } from '../../lib/blob.js';
import { supplementAccidentCircumstancesFromBody } from '../../lib/supplement-parse.js';
import {
  buildMinimalAnchorEnvelope,
  buildRetroEnvelopeFromDoc,
  buildRetroEnvelopeFromEml,
  classifyArchiveFile,
  pickCaseFolder,
  selectOutlookOriginal,
  type LandedAttachment,
  type OutlookSearchCandidate,
  type RetroSearchHit,
} from '../../lib/retro-envelope.js';
import type { InboundEnvelope } from '../activities/fetchMessage.js';
import type { InboundClassification } from '../activities/classifyInbound.js';

/** The parse activity's envelope shape as the retro rungs consume it. */
interface RetroParseResult {
  vrm?: { value?: string };
  reference?: { value?: string };
  extraction?: Record<string, { value?: string } | undefined>;
  skipped?: boolean;
}

/** Pure mapping of a parse envelope onto the create payload's parser fields —
 *  mirrors intakeOrchestrator's forwarding block exactly (fill-if-empty semantics
 *  live in the API). Replay-safe: pure over checkpointed activity results. */
function mapRetroParse(
  parseResult: RetroParseResult,
  bodyText: string,
): {
  parserEva: ParserEvaFields;
  parserVrm: string;
  parserRef: string;
  parserMileage: string;
  parserMileageUnit: string;
} {
  const ex = parseResult.extraction ?? {};
  const exVal = (k: string): string => (ex[k]?.value ?? '').trim();
  const exWorkProvider = exVal('work_provider');
  return {
    parserEva: {
      work_provider: exWorkProvider.toUpperCase() === 'UNKNOWN' ? '' : exWorkProvider,
      vehicle_model: exVal('vehicle_model'),
      claimant_name: exVal('claimant_name'),
      claimant_telephone: exVal('claimant_telephone'),
      claimant_email: exVal('claimant_email'),
      date_of_loss: exVal('date_of_loss'),
      date_of_instruction: exVal('date_of_instruction'),
      accident_circumstances:
        exVal('accident_circumstances') || supplementAccidentCircumstancesFromBody(bodyText),
      vat_status: exVal('vat_status'),
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
  /** The sender-matched provider's principal code (providerMatch) — the VRM-only
   *  Box-pick corroboration key (folder principal must agree; never cross providers). */
  providerPrincipal?: string;
  /** Manual-starter form (operator drain): locate the message, then re-derive the rest.
   *  `internetMessageId` + `mailbox` = inbound_email.source_message_id + source_mailbox. */
  internetMessageId?: string;
  mailbox?: string;
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
    if (runtimeStatus && runtimeStatus !== 'Failed' && runtimeStatus !== 'Terminated') {
      ctx.log(`[retro-case] instance ${instanceId} already ${runtimeStatus} — not restarted`);
      return { status: 200, jsonBody: { instanceId, deduped: true, runtimeStatus } };
    }
    await client.startNew('retroCaseOrchestrator', { instanceId, input });
    return client.createCheckStatusResponse(req, instanceId);
  },
});

/* ============================================================
   The reconstruction ladder orchestrator
   ============================================================ */
df.app.orchestration('retroCaseOrchestrator', function* (ctx) {
  const input = ctx.df.getInput() as RetroCaseInput;

  let trigger = input.trigger;
  let category = input.category;
  let keys = input.keys;
  let providerId = input.providerId;
  let providerPrincipal = input.providerPrincipal;

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
    if (!located.found) return { outcome: 'trigger_not_found' };

    trigger = yield ctx.df.callActivityWithRetry('fetchMessage', retry, {
      messageId: located.messageId,
      resource: located.resource,
    });
    const provider = (yield ctx.df.callActivityWithRetry('providerMatch', retry, trigger)) as {
      workProviderId?: string;
      matchState?: string;
      principalCode?: string;
    };
    providerId = provider.workProviderId;
    providerPrincipal = provider.principalCode;
    const classification = (yield ctx.df.callActivityWithRetry('classifyInbound', retry, {
      inbound: trigger,
      workProviderId: providerId,
      matchState: provider.matchState,
    })) as InboundClassification;
    category = classification.category;

    // Pure over checkpointed values (replay-safe — the decideCaseType/triage-assist
    // convention). No linkReplyOutcome here: the reply lane never ran on this path; the
    // resolve-existing rung below provides the same link-first/ambiguity protection.
    const env = trigger as { candidateRef?: string; candidateVrm?: string };
    const decision = decideRetro({
      category: classification.category,
      subtype: classification.subtype,
      bodyCaseref: classification.bodyCaseref,
      bodyJobref: classification.bodyJobref,
      bodyVrm: classification.bodyVrm,
      candidateRef: env.candidateRef,
      candidateVrm: env.candidateVrm,
      isReply: classification.isReply,
    });
    if (!decision.attempt) {
      return { outcome: 'not_eligible', reasons: decision.reasons };
    }
    keys = decision.keys;
  }

  if (!keys || (!keys.casePo && !keys.externalRef && !keys.vrm)) {
    return { outcome: 'not_eligible', reasons: ['no_usable_key'] };
  }

  // Rung 1 — ANY-status existence check + link (the billing fix). A hit ends the ladder.
  const resolved = (yield ctx.df.callActivityWithRetry('retroResolveExisting', retry, {
    trigger,
    keys,
    providerId,
    triggerCategory: category,
  })) as { skipped?: string; outcome?: string; caseId?: string; candidateCount?: number };
  if (resolved.skipped) return { outcome: 'skipped', reason: resolved.skipped };
  if (resolved.outcome === 'gated_off') return { outcome: 'skipped', reason: 'api_gate_off' };
  if (resolved.outcome === 'linked') return { outcome: 'linked', caseId: resolved.caseId };
  if (resolved.outcome === 'ambiguous') {
    return { outcome: 'ambiguous', candidateCount: resolved.candidateCount };
  }

  const rungsTried: string[] = ['resolve_existing'];

  // Rung 2 — Box archive reconstruction (R2). Best-effort throughout: any rung failure
  // falls through to the failure audit; the primary intake already returned.
  let boxAmbiguity: number | undefined;
  try {
    const located = (yield ctx.df.callActivityWithRetry('retroBoxLocate', retry, {
      keys,
      providerPrincipal,
    })) as {
      skipped?: string;
      found?: boolean;
      reason?: string;
      folder?: { id: string; name: string };
      discoveredPo?: string;
      principalCode?: string;
      marker?: '' | 'A.' | 'AP.' | 'D.';
      basis?: string;
      candidateCount?: number;
    };
    if (!located.skipped) rungsTried.push('box_archive');
    boxAmbiguity = located.candidateCount && located.candidateCount > 1 ? located.candidateCount : undefined;

    if (!located.skipped && located.found && located.folder && located.discoveredPo) {
      const fetched = (yield ctx.df.callActivityWithRetry('retroBoxFetchInstruction', retry, {
        folderId: located.folder.id,
        folderName: located.folder.name,
        discoveredPo: located.discoveredPo,
        triggerReceivedAt: (trigger as { receivedAt?: string }).receivedAt,
      })) as {
        skipped?: string;
        envelope?: InboundEnvelope;
        instructionSource?: RetroReconstructionSource;
        otherFiles?: Array<{ boxFileId: string; filename: string; size?: number }>;
        subfolderCount?: number;
      };

      if (!fetched.skipped && fetched.envelope) {
        const original = fetched.envelope;
        let reconstructionSource: RetroReconstructionSource = fetched.instructionSource ?? 'minimal';

        // parse — the EXISTING activity, same best-effort doctrine as intake step 4 (a
        // total parser outage still creates the case; fields backfillable by staff).
        let parseResult: {
          vrm?: { value?: string };
          reference?: { value?: string };
          extraction?: Record<string, { value?: string } | undefined>;
          skipped?: boolean;
        } = {};
        if (reconstructionSource !== 'minimal') {
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
            })) as typeof parseResult;
          } catch (e) {
            if (!ctx.df.isReplaying) {
              ctx.log(`[retro] parse failed (best-effort, case still created): ${String(e)}`);
            }
            parseResult = {};
          }
        }

        // Pure mappings over checkpointed results — mirrors intake's parser forwarding.
        const { parserEva, parserVrm, parserRef, parserMileage, parserMileageUnit } =
          mapRetroParse(parseResult, String(original.body ?? ''));

        // Corroboration (pure, logged): with BOTH trigger keys present AND both parsed,
        // a double disagreement means the picked folder is suspect — demote to a Held
        // minimal anchor (never terminal on a contradicted match). A ref content-hit is
        // otherwise self-corroborating (the key came from INSIDE this folder's files).
        const refContradicts = Boolean(
          keys.externalRef && parserRef && normToken(parserRef) !== normToken(keys.externalRef),
        );
        const vrmContradicts = Boolean(
          keys.vrm &&
            (parserVrm || original.candidateVrm) &&
            normToken(parserVrm || original.candidateVrm) !== normToken(keys.vrm),
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
          parserAudit: (parseResult as { audit?: { value?: boolean; signals?: string[] } }).audit,
          classifierSubtype: input.subtype,
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
          keys,
          casePo: located.discoveredPo,
          vrm: parserVrm || original.candidateVrm || keys.vrm || '',
          statusName: statusDecision.status,
          onHold: statusDecision.onHold,
          actionReason: statusDecision.actionReason,
          reconstructionSource: effectiveSource,
          providerId,
          parserVrm,
          parserRef,
          parserMileage,
          parserMileageUnit,
          parserEva,
          caseType,
          caseTypeSignals: [...caseTypeSignals, ...statusDecision.signals, ...(contradicted ? ['retro_corroboration_failed'] : [])],
          boxFolder: { id: located.folder.id, url: `https://app.box.com/folder/${encodeURIComponent(located.folder.id)}` },
          triggerCategory: category,
          otherFiles: fetched.otherFiles ?? [],
        })) as { skipped?: string; outcome?: string; caseId?: string; casePo?: string | null };

        if (persisted.skipped) return { outcome: 'skipped', reason: persisted.skipped };
        if (persisted.outcome === 'gated_off') return { outcome: 'skipped', reason: 'api_gate_off' };
        // TKT-119 — the API's mint guard refused this original (an ack/digest-family
        // email can never be the case source): fall THROUGH to the next rung / the
        // failure record instead of ending the ladder silently.
        if (persisted.outcome === 'refused_category') {
          rungsTried.push('box_refused_category');
        } else {
          if (persisted.outcome === 'created' && persisted.caseId) {
            // Record-keeping parity with a linked live arrival: evidence rows for the
            // reconstructed original + status alignment. Best-effort — never unwinds
            // the created case. NO enrich (historical vehicle data adds nothing), NO
            // boxFolderCreate (the ARCHIVE folder was stamped in the create), NO
            // boxArchiveEvidence (uploads into the RO archive are refused by design).
            if (effectiveSource !== 'minimal') {
              try {
                yield ctx.df.callActivityWithRetry('classifyPersist', retry, {
                  caseId: persisted.caseId,
                  inbound: original,
                  typings: (parseResult as { attachmentTypings?: unknown }).attachmentTypings,
                });
              } catch (e) {
                if (!ctx.df.isReplaying) {
                  ctx.log(`[retro] classifyPersist failed (additive, non-blocking): ${String(e)}`);
                }
              }
            }
            try {
              yield ctx.df.callActivityWithRetry('statusEvaluate', retry, { caseId: persisted.caseId });
            } catch (e) {
              if (!ctx.df.isReplaying) {
                ctx.log(`[retro] statusEvaluate failed (additive, non-blocking): ${String(e)}`);
              }
            }
          }

          return {
            outcome: persisted.outcome,
            caseId: persisted.caseId,
            casePo: persisted.casePo,
            source: effectiveSource,
            ...(contradicted ? { corroboration: 'contradicted' } : {}),
          };
        }
      }
    }
  } catch (e) {
    if (!ctx.df.isReplaying) {
      ctx.log(`[retro] Box rung failed (best-effort, falling through): ${String(e)}`);
    }
  }

  // Rung 3 — Outlook $search (R3; own kill switch RETRO_OUTLOOK_SEARCH_ENABLED). Fires
  // only when the archive had NO folder for this case. An Outlook-only reconstruction
  // never discovers a Case/PO → decideRetroStatus lands it Held (casePoKnown=false) and
  // the create route keeps the PO namespace untouched (case_ref = the external ref).
  try {
    const outlook = (yield ctx.df.callActivityWithRetry('retroOutlookLocate', retry, {
      keys,
    })) as {
      skipped?: string;
      found?: boolean;
      messageId?: string;
      resource?: string;
      mailbox?: string;
      matchedKey?: string;
    };
    if (!outlook.skipped) rungsTried.push('outlook_search');

    if (!outlook.skipped && outlook.found && outlook.messageId && outlook.resource) {
      const original = (yield ctx.df.callActivityWithRetry('fetchMessage', retry, {
        messageId: outlook.messageId,
        resource: outlook.resource,
      })) as InboundEnvelope;

      // parse — same best-effort doctrine as the Box rung.
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
      const { parserEva, parserVrm, parserRef, parserMileage, parserMileageUnit } =
        mapRetroParse(parseResult, String(original.body ?? ''));

      // Corroboration is REQUIRED on this rung ($search relevance can surface thread
      // noise): the trigger's key must literally appear in the found message's
      // subject/body, or the parsed reference / VRM must agree. Uncorroborated →
      // NOTHING (no anchor without an archive folder — the ladder's bottom rule).
      const haystack = normToken(`${original.subject}\n${original.body ?? ''}`);
      const keyInText = [keys.casePo, keys.externalRef, keys.vrm]
        .filter((k): k is string => Boolean(k))
        .some((k) => haystack.includes(normToken(k)));
      const refAgrees = Boolean(
        keys.externalRef && parserRef && normToken(parserRef) === normToken(keys.externalRef),
      );
      const vrmAgrees = Boolean(
        keys.vrm &&
          (parserVrm || original.candidateVrm) &&
          normToken(parserVrm || original.candidateVrm) === normToken(keys.vrm),
      );
      if (keyInText || refAgrees || vrmAgrees) {
        const contentType = decideCaseType({
          parserCaseType: (parseResult as {
            case_type?: { value?: string | null; dual?: boolean; signals?: string[] };
          }).case_type,
          parserAudit: (parseResult as { audit?: { value?: boolean; signals?: string[] } }).audit,
          classifierSubtype: input.subtype,
        });
        const statusDecision = decideRetroStatus({
          triggerCategory: category ?? 'other',
          reconstruction: 'outlook',
          principalResolved: false,
          casePoKnown: false,
        });
        const persisted = (yield ctx.df.callActivityWithRetry('retroCreatePersist', retry, {
          original,
          trigger,
          keys,
          vrm: parserVrm || original.candidateVrm || keys.vrm || '',
          statusName: statusDecision.status,
          onHold: statusDecision.onHold,
          actionReason: statusDecision.actionReason,
          reconstructionSource: 'outlook',
          providerId,
          parserVrm,
          parserRef,
          parserMileage,
          parserMileageUnit,
          parserEva,
          caseType: contentType.caseType,
          caseTypeSignals: [
            ...contentType.signals,
            ...statusDecision.signals,
            `outlook_match:${outlook.matchedKey ?? 'unknown'}`,
          ],
          triggerCategory: category,
          otherFiles: [],
        })) as { skipped?: string; outcome?: string; caseId?: string; casePo?: string | null };

        if (persisted.skipped) return { outcome: 'skipped', reason: persisted.skipped };
        if (persisted.outcome === 'gated_off') return { outcome: 'skipped', reason: 'api_gate_off' };
        // TKT-119 — the API refused this original (ack/digest family): fall through to
        // the failure record so the email still gets its visible outcome.
        if (persisted.outcome === 'refused_category') {
          rungsTried.push('outlook_refused_category');
        } else {
          if (persisted.outcome === 'created' && persisted.caseId) {
            try {
              yield ctx.df.callActivityWithRetry('classifyPersist', retry, {
                caseId: persisted.caseId,
                inbound: original,
                typings: (parseResult as { attachmentTypings?: unknown }).attachmentTypings,
              });
            } catch (e) {
              if (!ctx.df.isReplaying) {
                ctx.log(`[retro] classifyPersist failed (additive, non-blocking): ${String(e)}`);
              }
            }
            try {
              yield ctx.df.callActivityWithRetry('statusEvaluate', retry, { caseId: persisted.caseId });
            } catch (e) {
              if (!ctx.df.isReplaying) {
                ctx.log(`[retro] statusEvaluate failed (additive, non-blocking): ${String(e)}`);
              }
            }
          }
          return {
            outcome: persisted.outcome,
            caseId: persisted.caseId,
            casePo: persisted.casePo,
            source: 'outlook',
          };
        }
      }
      if (!ctx.df.isReplaying) {
        ctx.log('[retro] outlook hit uncorroborated (key not in message; parse disagrees) — not created');
      }
      rungsTried.push('outlook_uncorroborated');
    }
  } catch (e) {
    if (!ctx.df.isReplaying) {
      ctx.log(`[retro] Outlook rung failed (best-effort, falling through): ${String(e)}`);
    }
  }

  // Bottom of the ladder: record the attempt so ops can see it; the triage row is left
  // exactly as today (case_id NULL, staff triage).
  yield ctx.df.callActivityWithRetry('retroRecordFailure', retry, {
    trigger,
    keys,
    triggerCategory: category,
    rungsTried,
    ...(boxAmbiguity ? { ambiguousFolders: boxAmbiguity } : {}),
  });
  return { outcome: 'no_source', ...(boxAmbiguity ? { ambiguousFolders: boxAmbiguity } : {}) };
});

/* ============================================================
   Activities (gate read INSIDE each — the parse/enrich convention)
   ============================================================ */

df.app.activity('retroFindTrigger', {
  handler: async (
    input: { internetMessageId: string; mailbox: string },
    ctx,
  ): Promise<{ skipped?: string; found?: boolean; messageId?: string; resource?: string }> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    const hit = await findMessageByInternetMessageId(input.mailbox, input.internetMessageId);
    if (!hit) {
      ctx.log(JSON.stringify({ evt: 'retroFindTrigger', found: false, mailbox: input.mailbox }));
      return { found: false };
    }
    return {
      found: true,
      messageId: hit.id,
      resource: `users/${input.mailbox}/messages/${hit.id}`,
    };
  },
});

df.app.activity('retroResolveExisting', {
  handler: async (
    input: {
      trigger: unknown;
      keys: RetroKeys;
      providerId?: string;
      triggerCategory?: InboundCategory;
    },
    ctx,
  ): Promise<unknown> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    const result = await dataApi.retroResolveExisting({
      trigger: input.trigger,
      keys: input.keys,
      providerId: input.providerId,
      triggerCategory: input.triggerCategory,
    });
    ctx.log(JSON.stringify({ evt: 'retroResolveExisting', outcome: result.outcome, caseId: result.caseId }));
    return result;
  },
});

/** The archive roots the Box rung may search — RETRO_BOX_ARCHIVE_ROOT_IDS (orch side;
 *  the box-webhook Function enforces the same ids via its own BOX_READONLY_ROOT_IDS). */
function archiveRootIds(): string[] {
  return gates
    .retroBoxArchiveRootIds()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

df.app.activity('retroBoxLocate', {
  handler: async (
    input: { keys: RetroKeys; providerPrincipal?: string },
    ctx,
  ): Promise<unknown> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    if (!gates.boxApi()) return { skipped: 'box_gate_off' };
    const rootIds = archiveRootIds();
    if (rootIds.length === 0) return { skipped: 'no_archive_roots' };

    // Key ladder, strongest first. The Case/PO (when quoted) is a FOLDER-NAME search;
    // the external ref + VRM are CONTENT searches (the claim ref / registration lives
    // INSIDE the archived instruction files, not in any name).
    const refHits: RetroSearchHit[] = [];
    const vrmHits: RetroSearchHit[] = [];
    if (input.keys.casePo) {
      const r = await box.searchContent({ query: input.keys.casePo, rootIds, type: 'folder' });
      refHits.push(...r.entries);
    }
    if (input.keys.externalRef) {
      const r = await box.searchContent({ query: input.keys.externalRef, rootIds });
      refHits.push(...r.entries);
    }
    // Skip the noisy VRM sweep when the reference tier is already decisive.
    let needVrm = Boolean(input.keys.vrm);
    if (needVrm && refHits.length > 0 && pickCaseFolder(refHits, []).folder) needVrm = false;
    if (needVrm && input.keys.vrm) {
      const r = await box.searchContent({ query: input.keys.vrm, rootIds });
      vrmHits.push(...r.entries);
    }

    const pick = pickCaseFolder(refHits, vrmHits);
    if (!pick.folder) {
      ctx.log(JSON.stringify({ evt: 'retroBoxLocate', found: false, candidates: pick.candidateCount }));
      return { found: false, reason: pick.candidateCount > 1 ? 'ambiguous_folders' : 'no_hits', candidateCount: pick.candidateCount };
    }

    // The folder name must BE a Case/PO (a hit in a non-case subtree is not a case).
    const discoveredPo = normalizeCasePo(pick.folder.name);
    if (!CASE_PO_SHAPE_RE.test(discoveredPo)) {
      ctx.log(JSON.stringify({ evt: 'retroBoxLocate', found: false, reason: 'folder_not_po_shaped', name: pick.folder.name }));
      return { found: false, reason: 'folder_not_po_shaped', candidateCount: pick.candidateCount };
    }

    const principals = await dataApi.principals();
    const match = matchPrincipalByCasePo(
      discoveredPo,
      principals.map((p) => p.principalCode),
    );

    // A VRM-only pick (weakest key) additionally requires the folder's principal to
    // agree with the sender-matched provider — never link across providers on a
    // registration alone (ADR-0010 applied to the archive).
    const vrmOnly = !input.keys.casePo && !input.keys.externalRef;
    if (vrmOnly) {
      const sender = (input.providerPrincipal ?? '').trim().toUpperCase();
      if (!match || !sender || match.principal !== sender) {
        ctx.log(JSON.stringify({ evt: 'retroBoxLocate', found: false, reason: 'vrm_only_uncorroborated' }));
        return { found: false, reason: 'vrm_only_uncorroborated', candidateCount: pick.candidateCount };
      }
    }

    ctx.log(JSON.stringify({
      evt: 'retroBoxLocate', found: true, folderId: pick.folder.id, discoveredPo,
      principal: match?.principal ?? '', marker: match?.marker ?? '', basis: pick.basis,
    }));
    return {
      found: true,
      folder: pick.folder,
      discoveredPo,
      principalCode: match?.principal ?? '',
      marker: match?.marker ?? '',
      basis: pick.basis,
      candidateCount: pick.candidateCount,
    };
  },
});

df.app.activity('retroBoxFetchInstruction', {
  handler: async (
    input: { folderId: string; folderName: string; discoveredPo: string; triggerReceivedAt?: string },
    ctx,
  ): Promise<unknown> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    if (!gates.boxApi()) return { skipped: 'box_gate_off' };

    const listing = await box.listFolderItems(input.folderId);
    const entries: BoxFolderEntry[] = (listing.entries ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      size: e.size,
      createdAt: e.created_at,
    }));
    const files = entries.filter((e) => (e.type ?? 'file') === 'file');
    const subfolderCount = entries.length - files.length;
    const fallbackReceivedAt = input.triggerReceivedAt ?? new Date().toISOString();

    let envelope: InboundEnvelope | undefined;
    let instructionSource: RetroReconstructionSource = 'minimal';
    const consumed = new Set<string>();

    // Preference ladder: the archived original .eml → a parseable instruction document
    // → minimal anchor. Each arm degrades on failure instead of sinking the rung.
    const candidate = selectBoxInstructionCandidate(entries);
    if (candidate?.kind === 'eml') {
      try {
        const dl = await box.downloadFile(candidate.entry.id);
        const rawBytes = Buffer.from(dl.contentBase64, 'base64');
        const prefix = `retro-box-${candidate.entry.id}`;
        const emlName = dl.filename || candidate.entry.name || 'original.eml';
        const emlUp = await uploadEvidenceBytes(prefix, emlName, rawBytes, 'message/rfc822');
        const rawEmlRef: LandedAttachment = {
          filename: emlName,
          contentType: 'message/rfc822',
          blobPath: emlUp.blobPath,
          size: emlUp.size,
        };
        let exploded: ExplodedEml | undefined;
        try {
          exploded = await callExplodeEml({ documentBase64: dl.contentBase64, filename: emlName });
        } catch (e) {
          ctx.warn(`[retroBoxFetchInstruction] explode-eml failed (degrading to raw .eml): ${String(e)}`);
        }
        if (exploded) {
          const landed: LandedAttachment[] = [];
          for (const a of exploded.attachments) {
            const bytes = Buffer.from(a.content_base64, 'base64');
            const up = await uploadEvidenceBytes(prefix, a.filename, bytes, a.content_type);
            landed.push({ filename: a.filename, contentType: a.content_type, blobPath: up.blobPath, size: up.size });
          }
          envelope = buildRetroEnvelopeFromEml(exploded, landed, rawEmlRef, {
            boxFileId: candidate.entry.id,
            discoveredPo: input.discoveredPo,
            fallbackReceivedAt,
          });
        } else {
          // Explode unavailable — the parser ENGINE reads .eml itself; hand it the raw file.
          envelope = buildRetroEnvelopeFromDoc(rawEmlRef, {
            boxFileId: candidate.entry.id,
            discoveredPo: input.discoveredPo,
            fallbackReceivedAt,
            folderName: input.folderName,
          });
        }
        instructionSource = 'box_eml';
        consumed.add(candidate.entry.id);
      } catch (e) {
        ctx.warn(`[retroBoxFetchInstruction] .eml download failed (trying document arm): ${String(e)}`);
      }
    }
    if (!envelope) {
      const docCandidate = selectBoxInstructionCandidate(
        entries.filter((e) => !/\.(eml|msg)$/i.test(e.name)),
      );
      if (docCandidate?.kind === 'doc') {
        try {
          const dl = await box.downloadFile(docCandidate.entry.id);
          const bytes = Buffer.from(dl.contentBase64, 'base64');
          const prefix = `retro-box-${docCandidate.entry.id}`;
          const docName = dl.filename || docCandidate.entry.name;
          const up = await uploadEvidenceBytes(prefix, docName, bytes, 'application/octet-stream');
          envelope = buildRetroEnvelopeFromDoc(
            { filename: docName, contentType: 'application/octet-stream', blobPath: up.blobPath, size: up.size },
            {
              boxFileId: docCandidate.entry.id,
              discoveredPo: input.discoveredPo,
              fallbackReceivedAt,
              folderName: input.folderName,
            },
          );
          instructionSource = 'box_doc';
          consumed.add(docCandidate.entry.id);
        } catch (e) {
          ctx.warn(`[retroBoxFetchInstruction] document download failed (minimal anchor): ${String(e)}`);
        }
      }
    }
    if (!envelope) {
      envelope = buildMinimalAnchorEnvelope(
        { receivedAt: input.triggerReceivedAt },
        input.discoveredPo,
        input.folderId,
      );
      instructionSource = 'minimal';
    }

    // Every other archive file registers as byte-less Box evidence (id + link — the
    // one-way mirror stays one-way; nothing is copied out except the instruction).
    const otherFiles = files
      .filter((f) => !consumed.has(f.id))
      .map((f) => ({ boxFileId: f.id, filename: f.name, size: f.size }));

    ctx.log(JSON.stringify({
      evt: 'retroBoxFetchInstruction', folderId: input.folderId, source: instructionSource,
      attachments: envelope.attachments.length, otherFiles: otherFiles.length, subfolderCount,
    }));
    return { envelope, instructionSource, otherFiles, subfolderCount };
  },
});

df.app.activity('retroCreatePersist', {
  handler: async (
    input: {
      original: InboundEnvelope;
      trigger: unknown;
      keys: RetroKeys;
      casePo?: string;
      vrm?: string;
      statusName: 'eva_submitted' | 'needs_review';
      onHold: boolean;
      actionReason?: 'needs_review';
      reconstructionSource: RetroReconstructionSource;
      providerId?: string;
      parserVrm?: string;
      parserRef?: string;
      parserMileage?: string;
      parserMileageUnit?: string;
      parserEva?: ParserEvaFields;
      caseType?: string;
      caseTypeSignals?: string[];
      boxFolder?: { id: string; url?: string };
      triggerCategory?: InboundCategory;
      otherFiles?: Array<{ boxFileId: string; filename: string; size?: number }>;
    },
    ctx,
  ): Promise<unknown> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    const result = await dataApi.retroCreate({
      original: input.original,
      trigger: input.trigger,
      keys: input.keys,
      casePo: input.casePo,
      vrm: input.vrm,
      statusName: input.statusName,
      onHold: input.onHold,
      actionReason: input.actionReason,
      reconstructionSource: input.reconstructionSource,
      providerId: input.providerId,
      parserVrm: input.parserVrm,
      parserRef: input.parserRef,
      parserMileage: input.parserMileage,
      parserMileageUnit: input.parserMileageUnit,
      parserEva: input.parserEva,
      caseType: input.caseType as 'standard' | 'audit' | 'audit_total_loss' | 'diminution' | undefined,
      caseTypeSignals: input.caseTypeSignals,
      boxFolder: input.boxFolder,
      triggerCategory: input.triggerCategory,
    });

    // Register the archive folder's OTHER files as byte-less Box evidence (link-only;
    // acceptedForEva=false so a retro backfill never pollutes the EVA image rules).
    // Best-effort: an evidence hiccup never unwinds the created/linked case.
    const caseId = result.caseId;
    if (caseId && (result.outcome === 'created' || result.outcome === 'already_exists_linked')) {
      const rows = (input.otherFiles ?? []).map((f) => ({
        filename: f.filename,
        boxFileId: f.boxFileId,
        boxFileUrl: `https://app.box.com/file/${encodeURIComponent(f.boxFileId)}`,
        size: f.size,
        evidenceClass: classifyArchiveFile(f.filename),
        acceptedForEva: false,
        sourceLabel: 'retro_box_archive',
      }));
      if (rows.length > 0) {
        try {
          const persisted = await dataApi.registerBoxEvidence(caseId, rows);
          ctx.log(JSON.stringify({ evt: 'retroCreatePersist', evidenceRows: persisted.persisted }));
        } catch (e) {
          ctx.warn(`[retroCreatePersist] archive evidence registration failed (best-effort): ${String(e)}`);
        }
      }
    }

    ctx.log(JSON.stringify({ evt: 'retroCreatePersist', outcome: result.outcome, caseId: result.caseId, casePo: result.casePo }));
    return result;
  },
});

df.app.activity('retroOutlookLocate', {
  handler: async (input: { keys: RetroKeys }, ctx): Promise<unknown> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    if (!gates.retroOutlookSearch()) return { skipped: 'outlook_gate_off' };
    const mailboxes = intakeMailboxes().map((m) => m.mailbox);
    if (mailboxes.length === 0) return { skipped: 'no_intake_mailboxes' };

    // Key ladder, strongest-first; a decisive earlier key skips the noisier later
    // sweeps. Each mailbox searched independently — one failing mailbox (throttle,
    // RBAC cache) must not sink the rung.
    const ladder: Array<{ key: string; matchedKey: string }> = [];
    if (input.keys.externalRef) ladder.push({ key: input.keys.externalRef, matchedKey: 'external_ref' });
    if (input.keys.casePo) ladder.push({ key: input.keys.casePo, matchedKey: 'case_po' });
    if (input.keys.vrm) ladder.push({ key: input.keys.vrm, matchedKey: 'vrm' });

    for (const rung of ladder) {
      const candidates: OutlookSearchCandidate[] = [];
      for (const mailbox of mailboxes) {
        try {
          const hits = await searchMessages(mailbox, kqlPhrase(rung.key), 25);
          candidates.push(...hits.map((h) => ({ ...h, mailbox })));
        } catch (e) {
          ctx.warn(`[retroOutlookLocate] $search failed on ${mailbox} (continuing): ${String(e)}`);
        }
      }
      const pick = selectOutlookOriginal(candidates, { intakeMailboxes: mailboxes });
      if (pick) {
        ctx.log(JSON.stringify({
          evt: 'retroOutlookLocate', found: true, mailbox: pick.mailbox,
          matchedKey: rung.matchedKey, candidates: candidates.length,
        }));
        return {
          found: true,
          messageId: pick.id,
          mailbox: pick.mailbox,
          resource: `users/${pick.mailbox}/messages/${pick.id}`,
          matchedKey: rung.matchedKey,
        };
      }
    }
    ctx.log(JSON.stringify({ evt: 'retroOutlookLocate', found: false }));
    return { found: false };
  },
});

df.app.activity('retroRecordFailure', {
  handler: async (
    input: {
      trigger: unknown;
      keys: RetroKeys;
      triggerCategory?: InboundCategory;
      rungsTried: string[];
      ambiguousFolders?: number;
    },
    ctx,
  ): Promise<unknown> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    const env = input.trigger as { internetMessageId?: string; subject?: string };
    await dataApi.recordAudit({
      action: 'retro_reconstruction_failed',
      severity: 'warning',
      summary: `Retro: no case found or reconstructable for ${input.triggerCategory ?? 'update'} email (${
        input.keys.casePo ?? input.keys.externalRef ?? input.keys.vrm ?? 'no key'
      })`,
      after: {
        keys: input.keys,
        rungsTried: input.rungsTried,
        ...(input.ambiguousFolders ? { ambiguousFolders: input.ambiguousFolders } : {}),
        messageId: env.internetMessageId,
        subject: env.subject,
      },
    });
    // TKT-119c — give the failure a VISIBLE home: stamp the trigger email's triage row
    // so staff see "Unable to locate" on the inbox row instead of a silent nothing.
    // Best-effort (schema-tolerant server-side) — the audit above is the durable record.
    if (env.internetMessageId) {
      try {
        await dataApi.markInboundAttention({
          sourceMessageId: env.internetMessageId,
          reason: 'unable_to_locate',
        });
      } catch (e) {
        ctx.warn(`[retroRecordFailure] attention stamp failed (best-effort): ${String(e)}`);
      }
    }
    ctx.log(JSON.stringify({ evt: 'retroRecordFailure', keys: input.keys, rungsTried: input.rungsTried }));
    return { recorded: true };
  },
});
