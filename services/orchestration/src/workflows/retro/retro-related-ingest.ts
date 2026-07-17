/**
 * retroRelatedIngestOrchestrator (TKT-225 / ADR-0022 amendment 2026-07-16).
 *
 * The initial retro construction is like receiving a new case: the related emails the
 * TKT-222 backfill row-linked may hold the attachments and details the reconstruction is
 * missing. This CHILD sub-orchestrator (one parent history event — the
 * boxFolderCreateOrchestrator precedent) ingests each linked related email exactly like a
 * new intake: fetchMessage (attachment bytes + raw `.eml` land in blob with sha256, at
 * deterministic paths) → parse → classifyPersist (bodyInstructionFallback OFF — up to 25
 * chasers/acks must not each mint a body-text "instruction") → extractImages →
 * retroBackfillFields (fill-gaps only, via the Data API's applyParserFields engine — never
 * overwriting a set value, no provider recovery, no Case/PO mint). One statusEvaluate at
 * the end re-aligns the case.
 *
 * Sequential ON PURPOSE (not Task.all): the loop bounds Graph/parser/OCR pressure, and a
 * per-row try/catch salvages the run — one bad attachment/email never sinks the batch
 * (the ladder's established best-effort doctrine). Field application is
 * corroboration-guarded (relatedParseContradictsKeys — the demotion rule shared with the
 * Outlook-original arm); EVIDENCE is not (the email is already subject-corroborated and
 * row-linked to this case).
 *
 * Gates: the parent schedules this child only when retroLinkRelated returned
 * `ingestRows` — the RETRO_RELATED_INGEST_ENABLED decision checkpointed in the activity
 * result (never read here; the parse/enrich convention). The retroBackfillFields activity
 * re-checks both gates, and the Data API re-checks RETRO_CASE_ENABLED server-side.
 *
 * Idempotent end to end: deterministic blob paths → the evidence route's
 * (case_id, storage_path) dedupe + sha256 twin-merge (TKT-133); applyParserFields is
 * strictly fill-if-empty, so a re-run (TKT-223 force drain) no-ops on fields and heals the
 * TKT-222 v1 link-only rows with evidence.
 */

import * as df from 'durable-functions';
import type { Task } from 'durable-functions';
import type { RetroKeys } from '@cs/domain';
import type { InboundEnvelope } from '../intake/fetchMessage.js';
import { mapRetroParse } from './retro-case.js';
import { relatedParseContradictsKeys } from './retro-envelope.js';

/** The parse activity's envelope shape as this chain consumes it (retro-case.ts twin). */
interface RelatedParseResult {
  vrm?: { value?: string };
  reference?: { value?: string };
  extraction?: Record<string, { value?: string } | undefined>;
  resolvedWorkProvider?: string;
  attachmentTypings?: unknown;
  skipped?: boolean;
}

export interface RetroRelatedIngestInput {
  caseId: string;
  /** The ingest-eligible rows the retroLinkRelated activity returned (receivedAt ASC). */
  rows: Array<{
    internetMessageId: string;
    messageId: string;
    resource: string;
    mailbox: string;
    receivedAt: string;
  }>;
  /** The reconstruction search keys — the contradiction guard's reference point. */
  keys: RetroKeys;
  /** Best-known case VRM (registration_visible / plate-OCR constraint). */
  caseVrm?: string;
  /** The CASE's resolved provider — the per-provider AI opt-out holds on ingest too. */
  workProviderId?: string;
  /** Resolved principal code — extraction filename stems / parse providerHint. */
  providerPrincipal?: string;
}

const retry = new df.RetryOptions(5_000, 3);
retry.backoffCoefficient = 2;
retry.maxRetryIntervalInMilliseconds = 60_000;

/** True when the mapped parse carries ANY field worth offering to the fill-gaps engine. */
function parseYieldedAnything(mapped: ReturnType<typeof mapRetroParse>): boolean {
  if (mapped.parserVrm || mapped.parserRef || mapped.parserMileage) return true;
  return Object.entries(mapped.parserEva).some(
    ([key, value]) =>
      key !== 'source_reference' && typeof value === 'string' && value.trim() !== '',
  );
}

df.app.orchestration('retroRelatedIngestOrchestrator', function* (
  ctx,
): Generator<Task, unknown, never> {
  const input = ctx.df.getInput() as RetroRelatedIngestInput;
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const keys = input.keys ?? {};

  let processed = 0;
  let failed = 0;
  let fieldsApplied = 0;

  for (const row of rows) {
    // Per-row salvage: one bad email never sinks the batch (per-doc/per-image salvage
    // already lives inside parse/extractImages/classifyPersist).
    try {
      // 1. Full intake-shaped fetch — attachments + raw .eml land in blob with sha256 at
      //    deterministic {messageId}/{filename} paths (idempotent under replay/re-run).
      const env = (yield ctx.df.callActivityWithRetry('fetchMessage', retry, {
        messageId: row.messageId,
        resource: row.resource,
      })) as InboundEnvelope;

      // 2. Parse (best-effort — the prepareOutlookOriginal fallback pattern: a parser
      //    outage still persists the evidence below).
      let parseResult: RelatedParseResult = {};
      try {
        const parseAttachments =
          env.attachments.length > 0 ? env.attachments : env.rawEml ? [env.rawEml] : [];
        parseResult = (yield ctx.df.callActivityWithRetry('parse', retry, {
          messageId: env.messageId,
          attachments: parseAttachments,
          providerHint: input.providerPrincipal,
        })) as RelatedParseResult;
      } catch (e) {
        if (!ctx.df.isReplaying) {
          ctx.log(`[retroRelatedIngest] parse failed (best-effort, evidence still persists): ${String(e)}`);
        }
        parseResult = {};
      }

      // 3. Pure over checkpointed results: the intake field mapping + the shared
      //    contradiction rule (BOTH ref and VRM parsed and BOTH disagree = suspect).
      const mapped = mapRetroParse(
        parseResult,
        String(env.body ?? ''),
        env.internetMessageId || env.messageId,
      );
      const contradicted = relatedParseContradictsKeys(
        keys,
        mapped.parserRef,
        mapped.parserVrm,
        env.candidateVrm ?? '',
      );

      // 4. Evidence rows (sha256-carrying; route dedupes on (case_id, storage_path) and
      //    merges sha256 twins). bodyInstructionFallback OFF (D6): a chaser/ack body must
      //    not become an `instruction` evidence row on a reconstructed case.
      yield ctx.df.callActivityWithRetry('classifyPersist', retry, {
        caseId: input.caseId,
        inbound: env,
        typings: parseResult.attachmentTypings,
        ...(input.caseVrm ? { caseVrm: input.caseVrm } : {}),
        ...(input.workProviderId ? { workProviderId: input.workProviderId } : {}),
        bodyInstructionFallback: false,
      });

      // 5. Embedded images (additive, best-effort — intake step-3.5 parity).
      try {
        yield ctx.df.callActivityWithRetry('extractImages', retry, {
          caseId: input.caseId,
          messageId: env.messageId,
          attachments: env.attachments,
          ...(input.caseVrm ? { caseVrm: input.caseVrm } : {}),
          ...(input.workProviderId ? { workProviderId: input.workProviderId } : {}),
          ...(input.providerPrincipal ? { providerPrincipal: input.providerPrincipal } : {}),
        });
      } catch (e) {
        if (!ctx.df.isReplaying) {
          ctx.log(`[retroRelatedIngest] extractImages failed (additive, non-blocking): ${String(e)}`);
        }
      }

      // 6. Fields fill gaps ONLY when the parse does not contradict the case keys (D5) —
      //    evidence above persists either way.
      if (!contradicted && parseYieldedAnything(mapped)) {
        const backfill = (yield ctx.df.callActivityWithRetry('retroBackfillFields', retry, {
          caseId: input.caseId,
          sourceInternetMessageId: env.internetMessageId || env.messageId,
          parserVrm: mapped.parserVrm,
          parserRef: mapped.parserRef,
          parserMileage: mapped.parserMileage,
          parserMileageUnit: mapped.parserMileageUnit,
          parserEva: mapped.parserEva,
        })) as { outcome?: string; vrmFilled?: boolean; skipped?: string };
        if (backfill.outcome === 'applied') fieldsApplied += 1;
      } else if (contradicted && !ctx.df.isReplaying) {
        ctx.log(JSON.stringify({
          evt: 'retroRelatedIngest',
          caseId: input.caseId,
          internetMessageId: row.internetMessageId,
          outcome: 'fields_skipped_contradicted',
        }));
      }

      processed += 1;
    } catch (e) {
      failed += 1;
      if (!ctx.df.isReplaying) {
        ctx.log(`[retroRelatedIngest] row failed (salvaged, continuing): ${String(e)}`);
      }
      continue;
    }
  }

  // One status re-alignment for the whole batch (best-effort).
  if (processed > 0) {
    try {
      yield ctx.df.callActivityWithRetry('statusEvaluate', retry, { caseId: input.caseId });
    } catch (e) {
      if (!ctx.df.isReplaying) {
        ctx.log(`[retroRelatedIngest] statusEvaluate failed (additive, non-blocking): ${String(e)}`);
      }
    }
  }

  return { processed, failed, fieldsApplied };
});
