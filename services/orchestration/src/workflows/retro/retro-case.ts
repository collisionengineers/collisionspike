/**
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
  decideCaseType,
  decideRetro,
  decideRetroStatus,
  markerToCaseType,
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
  const exWorkProvider = exVal('work_provider');
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
          parserAudit: (parseResult as {
            audit?: { value?: boolean; signals?: string[] };
          }).audit,
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
        })) as {
          skipped?: string;
          outcome?: string;
          caseId?: string;
          casePo?: string | null;
          providerRecovery?: 'identity_ready' | 'not_needed' | 'blocked';
        };

        if (persisted.skipped) return { outcome: 'skipped', reason: persisted.skipped };
        if (persisted.outcome === 'gated_off') return { outcome: 'skipped', reason: 'api_gate_off' };
        // TKT-119 — the API's mint guard refused this original (an ack/digest-family
        // email can never be the case source): fall THROUGH to the next rung / the
        // failure record instead of ending the ladder silently.
        if (persisted.outcome === 'refused_category') {
          rungsTried.push('box_refused_category');
        } else {
          if (
            (persisted.outcome === 'created' || persisted.outcome === 'already_exists_linked') &&
            persisted.caseId
          ) {
            // Record-keeping parity with a linked live arrival: evidence rows for the
            // reconstructed original + status alignment. Best-effort — never unwinds
            // the created case. NO enrich (vehicle data adds nothing here), NO
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
        mapRetroParse(
          parseResult,
          String(original.body ?? ''),
          original.internetMessageId || original.messageId,
        );

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
          parserAudit: (parseResult as {
            audit?: { value?: boolean; signals?: string[] };
          }).audit,
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
        })) as {
          skipped?: string;
          outcome?: string;
          caseId?: string;
          casePo?: string | null;
          providerRecovery?: 'identity_ready' | 'not_needed' | 'blocked';
        };

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
            // A create or exact get-or-create replay can finish provider identity. Run the
            // same idempotent folder ensure for both; the sub-orchestrator proves the exact
            // Case/PO folder is directly under the pinned test root before stamping it.
            if (persisted.providerRecovery === 'identity_ready') {
              let folderResult: { folderId?: string; providerRecoveryCompleted?: boolean };
              try {
                folderResult = (yield ctx.df.callSubOrchestratorWithRetry(
                  'boxFolderCreateOrchestrator',
                  retry,
                  { caseId: persisted.caseId },
                )) as { folderId?: string; providerRecoveryCompleted?: boolean };
              } catch (e) {
                throw new ProviderArchivePendingError(
                  `Archive folder recovery failed for retro case ${persisted.caseId}: ${String(e)}`,
                );
              }
              if (!folderResult?.folderId || folderResult.providerRecoveryCompleted !== true) {
                throw new ProviderArchivePendingError(
                  `Provider identity is ready but the Archive folder is still pending for retro case ${persisted.caseId}`,
                );
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
            providerRecovery: persisted.providerRecovery === 'identity_ready'
              ? 'completed'
              : (persisted.providerRecovery ?? 'not_needed'),
          };
        }
      }
      if (!ctx.df.isReplaying) {
        ctx.log('[retro] outlook hit uncorroborated (key not in message; parse disagrees) — not created');
      }
      rungsTried.push('outlook_uncorroborated');
    }
  } catch (e) {
    if (e instanceof ProviderArchivePendingError) throw e;
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
