/**
 * orchestration/src/functions/box-classify-sweep.ts  (TKT-146)
 *
 * Timer sweep: vision-classifies images that arrived via Box FILE.UPLOADED. The
 * box-webhook Python Function registers those uploads as evidence rows (role `unknown`,
 * registration_visible NULL) but the event-time classify path only covered email/PDF
 * intake — Box-lane images sat role-unknown until a batch backfill (TKT-131). This sweep
 * closes that gap per the TKT-112 ownership model (ORCH owns autonomous stamps):
 *
 *   1. enumerate still-unclassified box_upload-lane image rows via the NEW read route
 *      GET /api/internal/evidence/unclassified-box (server-side: the TKT-131
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
 *   4. stamp via the EXISTING internal evidence route by re-POSTing the row's OWN
 *      identity (its `box:file:<id>` tag when present, else box_file_id — never a tag
 *      the row does not carry, and NEVER a sha256: see stampBoxEvidenceClassification);
 *   5. re-evaluate each stamped case's status (idempotent — the same re-invoke the
 *      FILE.UPLOADED registration and the evidence-backfill consumer already perform),
 *      so a case whose photo set now satisfies the EVA image rules advances.
 *
 * Failure semantics: NEVER blocks or deletes the registration row. A per-row failure
 * (facade 4xx/5xx, over-cap 413, classify null, stamp error) logs and continues — the
 * row simply stays role-unknown and is re-tried on later sweeps until the 14-day window
 * passes it by. A sweep with nothing to do costs one internal GET (0-row fast path).
 *
 * "Event time" here means within one sweep period of upload — with the FC1 caveat that
 * a plain NCRONTAB timer does not WAKE a scaled-to-zero Flex app (LIVE_FACTS
 * subscriptionRenewalRisk): the tick fires while the app is awake (intake push traffic,
 * queue work, the durable monitor's ~6h wake) and past-due catch-up runs it on the next
 * wake otherwise.
 */

import { app, type InvocationContext, type Timer } from '@azure/functions';
import { gates } from '@cs/domain/gates';
import {
  classifyImage,
  classificationToEvidenceFields,
} from '../lib/image-classify.js';
import { box } from '../lib/functions-client.js';
import { dataApi, type UnclassifiedBoxEvidenceRow } from '../lib/data-api.js';

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
 * Build the stamp re-POST row for the internal evidence route. Pure; exported for tests.
 * Pins two footguns:
 *   - identity mirroring — `sourceMessageId` is sent ONLY when the row itself carries
 *     one (a tag the row lacks would miss the route's NOT-EXISTS dedup and INSERT a
 *     duplicate row); `boxFileId` always rides along;
 *   - NEVER a sha256 — supplying one engages the TKT-133 twin pass, which can redirect
 *     the stamp onto a cross-lane twin and loop the sweep on the unstamped target.
 */
export function buildStampRow(
  row: UnclassifiedBoxEvidenceRow,
  fields: ReturnType<typeof classificationToEvidenceFields>,
): Parameters<typeof dataApi.stampBoxEvidenceClassification>[1] {
  return {
    filename: row.filename,
    evidenceClass: 'image',
    ...(row.sourceMessageId ? { sourceMessageId: row.sourceMessageId } : {}),
    boxFileId: row.boxFileId,
    imageRole: fields.imageRole,
    registrationVisible: fields.registrationVisible,
    acceptedForEva: fields.acceptedForEva,
    personReflection: fields.personReflection,
    ...(fields.excluded
      ? { excluded: true, exclusionReason: fields.exclusionReason ?? 'Excluded' }
      : {}),
  };
}

app.timer('box-classify-sweep', {
  schedule: SWEEP_SCHEDULE,
  handler: async (_timer: Timer, ctx: InvocationContext): Promise<void> => {
    // Honest no-ops: the TKT-064 gate (IMAGE_ROLE_CLASSIFY_ENABLED + model endpoint +
    // deployment) governs the classify; the Box gate governs the facade fetch. Either
    // off → images keep persisting role `unknown` exactly as before this sweep existed.
    if (!gates.imageRoleClassifyEnabled() || !gates.boxApi()) return;

    const started = Date.now();
    let rows: UnclassifiedBoxEvidenceRow[];
    try {
      rows = (await dataApi.unclassifiedBoxEvidence(SWEEP_CAP)).rows ?? [];
    } catch (e) {
      ctx.warn(
        `[box-classify-sweep] enumeration failed (will retry next sweep): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return;
    }
    if (rows.length === 0) return; // 0-row fast path — one internal GET, nothing else

    // Per-provider ai_allowed opt-out (docs/gated.md D6) — same policy + fail-open
    // semantics as classifyPersist / evidence-backfill, cached per sweep.
    const aiAllowedByProvider = new Map<string, boolean | null>();
    const stampedCases = new Set<string>();
    let classified = 0;
    let stamped = 0;
    let failed = 0;
    let skippedOptOut = 0;

    for (const row of rows) {
      try {
        const providerId = row.workProviderId || '';
        if (providerId) {
          let allowed = aiAllowedByProvider.get(providerId);
          if (allowed === undefined) {
            try {
              allowed = (await dataApi.workProviderAiAllowed(providerId)).aiAllowed;
            } catch {
              allowed = null; // fail-open on lookup error, exactly like classifyPersist
            }
            aiAllowedByProvider.set(providerId, allowed);
          }
          if (allowed === false) {
            skippedOptOut++;
            continue; // provider opted out of AI — the row stays role-unknown for staff
          }
        }

        // Bytes via the Box facade ONLY (server-side download cap → over-cap throws 413
        // and is absorbed by this row's catch — the row stays unknown, sweep continues).
        const dl = await box.downloadFile(row.boxFileId);

        const cls = await classifyImage({
          imageBase64: dl.contentBase64,
          contentType: mimeForClassify(row.filename, row.contentType),
          caseVrm: row.caseVrm || undefined,
        });
        if (!cls) {
          // classifyImage never throws — null covers auth/timeout/content-filter/
          // malformed. Role stays unknown; re-tried on later sweeps inside the window.
          failed++;
          ctx.log(
            JSON.stringify({ evt: 'boxClassifySweep.classifyNull', evidenceId: row.evidenceId }),
          );
          continue;
        }
        classified++;

        const fields = classificationToEvidenceFields(cls, row.caseVrm || undefined);
        await dataApi.stampBoxEvidenceClassification(row.caseId, buildStampRow(row, fields));
        stamped++;
        stampedCases.add(row.caseId);
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
      } catch (e) {
        // Per-row never-throws: a failed classify/stamp must never block (or delete)
        // the registration row, nor sink the rest of the sweep.
        failed++;
        ctx.warn(
          `[box-classify-sweep] ${row.evidenceId} left role-unknown: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }

    // Status recompute per stamped case — the same idempotent re-invoke the
    // FILE.UPLOADED registration performs; a newly-satisfied EVA image rule advances
    // the case. Best-effort: a miss here is re-run by any later evidence/status touch.
    for (const caseId of stampedCases) {
      try {
        await dataApi.evaluateStatus(caseId);
      } catch (e) {
        ctx.warn(
          `[box-classify-sweep] status re-evaluate failed for ${caseId}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }

    ctx.log(
      JSON.stringify({
        evt: 'boxClassifySweep',
        enumerated: rows.length,
        classified,
        stamped,
        failed,
        skippedOptOut,
        casesReEvaluated: stampedCases.size,
        ms: Date.now() - started,
      }),
    );
  },
});
