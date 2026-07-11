/**
 * orchestration/src/functions/box-classify-sweep.ts  (TKT-146)
 *
 * Timer sweep: vision-classifies images that arrived via Box FILE.UPLOADED. The
 * box-webhook Python Function registers those uploads as evidence rows (role `unknown`,
 * registration_visible NULL) but the event-time classify path only covered email/PDF
 * intake — Box-lane images sat role-unknown until a batch backfill (TKT-131). This sweep
 * closes that gap per the TKT-112 ownership model (ORCH owns autonomous stamps):
 *
 *   1. claim still-unclassified box_upload-lane image rows via
 *      POST /api/internal/evidence/unclassified-box (server-side: the TKT-131
 *      "still-unclassified" predicate image_role_code=unknown AND registration_visible
 *      IS NULL, a 14-day window, newest first, capped at SWEEP_CAP);
 *   2. fetch the image bytes through the EXISTING Box facade ONLY (box.downloadFile —
 *      the box-webhook Function's read route, capped server-side at
 *      BOX_DOWNLOAD_MAX_BYTES ~25 MiB; this app never calls Box REST directly);
 *   3. classify via lib/image-classify.ts — the TKT-064 policy VERBATIM (never-throws;
 *      case-VRM-constrained registration_visible; non-vehicle 'other' → role stays
 *      `unknown` [no 'other' choice-set option] + not accepted; person reflection →
 *      excluded), honouring the per-provider ai_allowed opt-out exactly like
 *      classifyPersist / evidence-backfill;
 *   4. stamp the exact enumerated evidence id through a dedicated Data API route; the
 *      metadata update atomically increments the case's durable status generation;
 *   5. re-evaluate and acknowledge that generation. Any crash/API failure leaves it
 *      pending for a later sweep, so a stamped case cannot be stranded.
 *
 * Failure semantics: NEVER blocks or deletes the registration row. A per-row failure
 * is reported against its durable claim. Row-specific terminal failures (Box missing/
 * over-cap, explicit model content-filter) are dead-lettered in place; transient failures
 * back off. Neither can monopolise the capped newest-first page. A crash leaves a lease
 * that excludes the row while later work drains, then safely expires for retry.
 *
 * "Event time" here means within one sweep period of upload. The primary wake path is
 * boxClassificationMonitorOrchestrator: its Durable timer wakes a scaled-to-zero FC1 app.
 * The NCRONTAB registration below remains only an already-awake catch-up fallback.
 */

import { app, type InvocationContext, type Timer } from '@azure/functions';
import { gates } from '@cs/domain/gates';
import {
  classifyImageWithOutcome,
  classificationToEvidenceFields,
  type ImageClassification,
  type ImageClassificationFailure,
} from '../lib/image-classify.js';
import { box } from '../lib/functions-client.js';
import {
  dataApi,
  type BoxClassificationFailure,
  type PendingStatusRecompute,
  type UnclassifiedBoxEvidenceRow,
} from '../lib/data-api.js';

/** Sweep period — every 5 minutes (six-field NCRONTAB). Recorded in TKT-146 changes.md. */
export const SWEEP_SCHEDULE = '0 */5 * * * *';

/** Per-sweep row cap (also the server-side LIMIT the read route applies). */
export const SWEEP_CAP = 25;

/** Extension → MIME for the AOAI data URL. Box-lane rows usually carry no content_type
 *  (the FILE.UPLOADED event has no MIME), so the filename is the best signal. */
const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
};

/** Pick the classify content-type: an honest image/* content_type wins, else the
 *  filename extension, else the classifier's own image/jpeg default. Exported for tests. */
export function mimeForClassify(filename: string, contentType?: string | null): string {
  const ct = (contentType ?? '').trim().toLowerCase();
  if (ct.startsWith('image/')) return ct;
  const m = /\.([a-z0-9]+)$/i.exec(filename ?? '');
  const mapped = m ? EXT_MIME[m[1].toLowerCase()] : undefined;
  return mapped ?? 'image/jpeg';
}

/**
 * Build the exact-row classification payload. The dedicated stamp route keys on the
 * enumerated evidence id + case id + Box file id and never enters the general evidence
 * insert/dedup path. Pure; exported for tests.
 */
export function buildStampRow(
  row: UnclassifiedBoxEvidenceRow,
  fields: ReturnType<typeof classificationToEvidenceFields>,
): Parameters<typeof dataApi.stampBoxEvidenceClassification>[2] {
  return {
    filename: row.filename,
    evidenceClass: 'image',
    ...(row.sourceMessageId ? { sourceMessageId: row.sourceMessageId } : {}),
    boxFileId: row.boxFileId,
    imageRole: fields.imageRole,
    registrationVisible: fields.registrationVisible,
    acceptedForEva: fields.acceptedForEva,
    excluded: fields.excluded,
    exclusionReason: fields.exclusionReason ?? null,
    decisionSource: 'classifier',
    personReflection: fields.personReflection,
  };
}

/** Row-specific Box failures are terminal; service/config failures may recover. */
export function boxDownloadFailure(error: unknown): BoxClassificationFailure {
  const text = error instanceof Error ? error.message : String(error ?? '');
  if (/→\s*(404|410)\b/.test(text)) {
    return { disposition: 'terminal', code: 'box_file_missing' };
  }
  if (/→\s*413\b/.test(text)) {
    return { disposition: 'terminal', code: 'box_file_too_large' };
  }
  return { disposition: 'transient', code: 'box_download_unavailable' };
}

type ProviderPolicyDecision = 'allowed' | 'opted_out' | 'lookup_failed';

/** Evaluate + generation-aware acknowledge. Failure leaves the request durable. */
async function settleStatusRequests(
  requests: Iterable<PendingStatusRecompute>,
  ctx: InvocationContext,
): Promise<number> {
  let completed = 0;
  for (const request of requests) {
    try {
      const ack = await dataApi.evaluateStatus(request.caseId, request.generation);
      if (ack.completed) completed++;
    } catch (e) {
      ctx.warn(
        `[box-classify-sweep] status re-evaluate remains pending for ${request.caseId} ` +
          `(generation ${request.generation}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  return completed;
}

/** One complete idempotent sweep. Shared by the Durable activity (primary wake path)
 *  and the existing plain timer (fallback while the FC1 host is already awake). */
export async function runBoxClassifySweep(ctx: InvocationContext): Promise<void> {
    const started = Date.now();

    // Drain durable work BEFORE checking classification gates. Turning off Box/model
    // access must stop new classifications, not strand status work already committed.
    let recoveredStatusRequests: PendingStatusRecompute[] = [];
    try {
      recoveredStatusRequests =
        (await dataApi.pendingStatusRecomputes(SWEEP_CAP)).rows ?? [];
    } catch (e) {
      ctx.warn(
        `[box-classify-sweep] pending status enumeration failed (will retry next sweep): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
    const recoveredStatuses = await settleStatusRequests(recoveredStatusRequests, ctx);

    // Honest no-ops: the TKT-064 gate (IMAGE_ROLE_CLASSIFY_ENABLED + model endpoint +
    // deployment) governs the classify; the Box gate governs the facade fetch. Either
    // off → images keep persisting role `unknown` exactly as before this sweep existed.
    if (!gates.imageRoleClassifyEnabled() || !gates.boxApi()) return;

    let rows: UnclassifiedBoxEvidenceRow[];
    try {
      rows = (await dataApi.claimUnclassifiedBoxEvidence(SWEEP_CAP)).rows ?? [];
    } catch (e) {
      ctx.warn(
        `[box-classify-sweep] enumeration failed (will retry next sweep): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return;
    }
    if (rows.length === 0) return; // 0-row fast path — one internal GET, nothing else

    // Per-provider ai_allowed decision cached per sweep. A lookup failure is a
    // fail-closed policy decision for this sweep: no bytes reach the model.
    const policyByProvider = new Map<string, ProviderPolicyDecision>();
    const stampedGenerations = new Map<string, number>();
    let classified = 0;
    let stamped = 0;
    let failed = 0;
    let skippedOptOut = 0;
    let skippedPolicyLookup = 0;
    let backedOff = 0;
    let deadLettered = 0;
    let failureReportFailed = 0;

    const reportFailure = async (
      row: UnclassifiedBoxEvidenceRow,
      failure: BoxClassificationFailure | ImageClassificationFailure,
    ): Promise<void> => {
      if (!row.claimToken) {
        failureReportFailed++;
        ctx.warn(`[box-classify-sweep] claimed row ${row.evidenceId} had no claim token`);
        return;
      }
      try {
        const result = await dataApi.reportBoxEvidenceClassificationFailure(
          row.evidenceId,
          row.claimToken,
          failure,
        );
        if (!result.updated) return; // expired/stale claimant; current owner decides
        if (failure.disposition === 'terminal') deadLettered++;
        else backedOff++;
      } catch (e) {
        // The persisted lease still keeps this row out of the next page. If the
        // report path stays unavailable, lease expiry makes it retryable later.
        failureReportFailed++;
        ctx.warn(
          `[box-classify-sweep] failure outcome for ${row.evidenceId} was not recorded: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    };

    for (const row of rows) {
      const providerId = row.workProviderId || '';
      if (providerId) {
        let decision = policyByProvider.get(providerId);
        if (decision === undefined) {
          try {
            const { aiAllowed } = await dataApi.workProviderAiAllowed(providerId);
            decision = aiAllowed === false ? 'opted_out' : 'allowed';
          } catch (e) {
            decision = 'lookup_failed';
            ctx.warn(
              `[box-classify-sweep] provider AI preference unavailable for ${providerId}; ` +
                `classification skipped for this sweep: ${
                  e instanceof Error ? e.message : String(e)
                }`,
            );
          }
          policyByProvider.set(providerId, decision);
        }
        if (decision === 'opted_out') {
          skippedOptOut++;
          failed++;
          await reportFailure(row, { disposition: 'transient', code: 'provider_ai_opted_out' });
          continue;
        }
        if (decision === 'lookup_failed') {
          skippedPolicyLookup++;
          failed++;
          await reportFailure(row, { disposition: 'transient', code: 'provider_policy_unavailable' });
          continue;
        }
      }

      // Bytes via the Box facade ONLY. A missing/over-cap file is terminal for
      // these exact bytes; service/auth/network failures remain transient.
      let dl: Awaited<ReturnType<typeof box.downloadFile>>;
      try {
        dl = await box.downloadFile(row.boxFileId);
      } catch (e) {
        failed++;
        await reportFailure(row, boxDownloadFailure(e));
        continue;
      }

      let outcome: Awaited<ReturnType<typeof classifyImageWithOutcome>>;
      try {
        const rawOutcome = await classifyImageWithOutcome({
          imageBase64: dl.contentBase64,
          contentType: mimeForClassify(row.filename, row.contentType),
          caseVrm: row.caseVrm || undefined,
        });
        // Keep test doubles and one rolling local build tolerant of the former
        // classification-or-null contract. The deployed detailed caller always
        // returns the tagged outcome shape.
        outcome = rawOutcome && typeof rawOutcome === 'object' && 'ok' in rawOutcome
          ? rawOutcome
          : rawOutcome
            ? { ok: true, classification: rawOutcome as ImageClassification }
            : {
                ok: false,
                failure: { disposition: 'transient', code: 'model_unavailable' },
              };
      } catch {
        // Test doubles may throw even though the real detailed classifier never does.
        outcome = {
          ok: false,
          failure: { disposition: 'transient', code: 'model_unavailable' },
        };
      }
      if (!outcome.ok) {
        failed++;
        await reportFailure(row, outcome.failure);
        ctx.log(
          JSON.stringify({
            evt: 'boxClassifySweep.classifyFailed',
            evidenceId: row.evidenceId,
            code: outcome.failure.code,
            disposition: outcome.failure.disposition,
          }),
        );
        continue;
      }
      classified++;

      const fields = classificationToEvidenceFields(
        outcome.classification,
        row.caseVrm || undefined,
      );
      let stamp: Awaited<ReturnType<typeof dataApi.stampBoxEvidenceClassification>>;
      try {
        stamp = await dataApi.stampBoxEvidenceClassification(
          row.evidenceId,
          row.caseId,
          buildStampRow(row, fields),
          row.claimToken ?? undefined,
        );
      } catch (e) {
        failed++;
        await reportFailure(row, { disposition: 'transient', code: 'classification_stamp_unavailable' });
        ctx.warn(
          `[box-classify-sweep] ${row.evidenceId} classification stamp failed: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
        continue;
      }
      if (!stamp.updated) {
        failed++;
        // If another writer already classified/excluded the row, this CAS no-ops.
        // If a protected decision left it unclassified, dead-lettering prevents a
        // futile retry loop; the claim-token CAS makes the distinction race-safe.
        await reportFailure(row, {
          disposition: 'terminal',
          code: 'classification_not_applicable',
        });
        ctx.log(
          JSON.stringify({
            evt: 'boxClassifySweep.stale',
            evidenceId: row.evidenceId,
            caseId: row.caseId,
          }),
        );
        continue;
      }
      stamped++;
      if (stamp.statusGeneration != null) {
        stampedGenerations.set(
          row.caseId,
          Math.max(stampedGenerations.get(row.caseId) ?? 0, stamp.statusGeneration),
        );
      }
      ctx.log(
        JSON.stringify({
          evt: 'boxClassifySweep.stamped',
          evidenceId: row.evidenceId,
          caseId: row.caseId,
          boxFileId: row.boxFileId,
          role: fields.imageRole,
          registrationVisible: fields.registrationVisible,
          excluded: fields.excluded === true,
        }),
      );
    }

    // Fast-path the generations requested by this invocation. They are already durable,
    // so a crash before/during this loop is recovered by the next sweep's opening drain.
    const currentStatusRequests = [...stampedGenerations].map(([caseId, generation]) => ({
      caseId,
      generation,
    }));
    const currentStatuses = await settleStatusRequests(currentStatusRequests, ctx);

    ctx.log(
      JSON.stringify({
        evt: 'boxClassifySweep',
        enumerated: rows.length,
        classified,
        stamped,
        failed,
        skippedOptOut,
        skippedPolicyLookup,
        backedOff,
        deadLettered,
        failureReportFailed,
        recoveredStatusRequests: recoveredStatusRequests.length,
        casesReEvaluated: recoveredStatuses + currentStatuses,
        ms: Date.now() - started,
      }),
    );
}

app.timer('box-classify-sweep', {
  schedule: SWEEP_SCHEDULE,
  handler: async (_timer: Timer, ctx: InvocationContext): Promise<void> =>
    runBoxClassifySweep(ctx),
});
