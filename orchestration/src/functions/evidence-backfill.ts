/**
 * orchestration/src/functions/evidence-backfill.ts  (TKT-145)
 *
 * Queue trigger: drains the `evidence-backfill` storage queue — one job per case_link
 * ACCEPT of a previously-UNCASED, attachment-bearing inbound email (enqueued by the Data
 * API's promoteAcceptedSuggestion strictly AFTER the link commit; payload shape shared via
 * api/src/lib/evidence-backfill-queue.ts's EvidenceBackfillJob). The suggest-first lanes
 * (TKT-102's Tractable PDF-VRM rung, the ref-gate rung) never ran classifyPersist/
 * extractImages, so the email's attachments were never persisted as evidence; this
 * consumer recovers them onto the case the accept attached the email to:
 *
 *   1. resolve the CURRENT Graph message id from the stored Internet-Message-Id
 *      ($filter — a Graph id changes when a message moves, so never trust a stored one);
 *   2. fallback (gated RETRO_OUTLOOK_SEARCH_ENABLED): whole-mailbox `$search` on the
 *      email's subject — reaches Deleted Items — with every candidate CORROBORATED on the
 *      exact internetMessageId before use (never a guessed message);
 *   3. fetch message + attachments (getMessageWithAttachments — the TKT-047 signature/
 *      logo-image floor applies exactly as at intake) + best-effort raw `.eml`;
 *   4. land the bytes in Blob (uploadEvidenceBytes — sha256 hashed at landing, TKT-133);
 *   5. the EXISTING persist chain: buildBaseEvidenceRows (the classifyPersist row
 *      assembly) + the TKT-064 image-classify stamping (same gates, same per-provider
 *      ai_allowed opt-out — resolved via the target case's provider) →
 *      dataApi.persistEvidence (the internal evidence route, whose TKT-133
 *      (case_id, sha256) dedup/LINK makes replays and double-accepts safe);
 *   6. status recompute (dataApi.evaluateStatus — the acceptance's second line);
 *   7. report `completed`/`failed` back to the Data API
 *      (POST /api/internal/inbound/{id}/evidence-backfill): `completed` writes the
 *      case-scoped attachment_classified audit; `failed` writes the durable
 *      "Attachments to add" staff note (the TKT-145 INVERSION of the always-note
 *      interim mitigation) + a warning audit.
 *
 * Retry semantics (the outlook-move.ts split): a TRANSIENT error (Graph/API 5xx/429/
 * network) rethrows so the queue redelivers (up to the ~5-dequeue poison limit); on the
 * LAST attempt — or any non-retryable failure (message gone, 4xx) — the terminal `failed`
 * outcome is reported instead so the note lands. The report itself is best-effort: if even
 * that fails on the last attempt the message poisons and the failure stays visible in App
 * Insights (the accept itself was never at risk — it committed before the enqueue).
 *
 * DELIBERATELY NOT here (recorded in TKT-145 changes.md): extractImages (PDF-embedded
 * photo extraction) and boxArchiveEvidence — the decided TKT-145 chain ends at the status
 * recompute; both are follow-up parity seams.
 */

import { app, type InvocationContext } from '@azure/functions';
import { gates } from '@cs/domain/gates';
import {
  findMessageByInternetMessageId,
  getMessageRawMime,
  getMessageWithAttachments,
  graphFetch,
  kqlPhrase,
  searchMessages,
} from '../lib/graph.js';
import { uploadEvidenceBytes } from '../lib/blob.js';
import { rawEmlFileName } from '../lib/evidence-names.js';
import { classifyImage, classificationToEvidenceFields } from '../lib/image-classify.js';
import { buildBaseEvidenceRows } from './activities/classifyPersist.js';
import type { InboundEnvelope } from './activities/fetchMessage.js';
import { dataApi } from '../lib/data-api.js';
import { isRetryableGraphError } from './outlook-move.js';

/** Keep in sync with api/src/lib/evidence-backfill-queue.ts (the producer). */
interface EvidenceBackfillJob {
  inboundEmailId: string;
  sourceMailbox: string;
  sourceMessageId: string;
  targetCaseId: string;
  subject?: string;
}

const MAX_DEQUEUE = 5; // host.json default maxDequeueCount

/** Candidates the $search fallback will corroborate before giving up. */
const SEARCH_CANDIDATE_CAP = 25;

/**
 * Whole-mailbox `$search` fallback (gated RETRO_OUTLOOK_SEARCH_ENABLED by the caller):
 * search on the email's SUBJECT (Graph $search cannot filter on internetMessageId — its
 * un-propertied scope is from/subject/body), then corroborate every candidate by fetching
 * its internetMessageId and requiring an EXACT match on the stored id. Returns the
 * current Graph id, or null. Never guesses: an uncorroborated candidate set is a miss.
 */
export async function locateBySubjectSearch(
  mailbox: string,
  subject: string,
  internetMessageId: string,
): Promise<string | null> {
  const phrase = (subject ?? '').trim();
  if (!phrase) return null;
  const hits = await searchMessages(mailbox, kqlPhrase(phrase), SEARCH_CANDIDATE_CAP);
  for (const h of hits) {
    try {
      const msg = await graphFetch<{ internetMessageId?: string }>(
        `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(h.id)}` +
          `?$select=internetMessageId`,
      );
      if ((msg.internetMessageId ?? '') === internetMessageId) return h.id;
    } catch {
      /* a single unreadable candidate never sinks the sweep */
    }
  }
  return null;
}

app.storageQueue('evidence-backfill', {
  queueName: 'evidence-backfill',
  connection: 'AzureWebJobsStorage',
  handler: async (item: unknown, ctx: InvocationContext): Promise<void> => {
    const job = (typeof item === 'string' ? JSON.parse(item) : item) as EvidenceBackfillJob;
    const dequeueCount = Number(ctx.triggerMetadata?.dequeueCount ?? 1);
    const lastAttempt = dequeueCount >= MAX_DEQUEUE;

    const fail = async (detail: string): Promise<void> => {
      ctx.warn(`[evidence-backfill] ${job.inboundEmailId}: ${detail}`);
      await dataApi.reportEvidenceBackfill(job.inboundEmailId, {
        outcome: 'failed',
        targetCaseId: job.targetCaseId,
        detail,
      });
    };

    try {
      if (!job.inboundEmailId || !job.targetCaseId) {
        // Nothing to report against — log and drop (never poison-loop a malformed job).
        ctx.error(`[evidence-backfill] malformed job dropped: ${JSON.stringify(job).slice(0, 300)}`);
        return;
      }
      if (!job.sourceMailbox || !job.sourceMessageId) {
        // No mailbox provenance to re-fetch from (the producer guards this, but a
        // hand-placed message might not) — terminal: the note tells staff to attach by hand.
        await fail('no mailbox provenance on the job (sourceMailbox/sourceMessageId missing)');
        return;
      }

      // 1 — resolve the CURRENT Graph message id from the Internet-Message-Id.
      const found = await findMessageByInternetMessageId(job.sourceMailbox, job.sourceMessageId);
      let graphId = found?.id ?? null;

      // 2 — whole-mailbox $search fallback (reaches Deleted Items). Gated on the SAME
      // RETRO_OUTLOOK_SEARCH_ENABLED kill switch as the retro Outlook rung — this IS
      // Graph-search behaviour and must be revocable with it. Candidates are corroborated
      // on the exact internetMessageId (locateBySubjectSearch) — never a guessed message.
      if (!graphId && gates.retroOutlookSearch() && (job.subject ?? '').trim()) {
        try {
          graphId = await locateBySubjectSearch(
            job.sourceMailbox,
            String(job.subject),
            job.sourceMessageId,
          );
        } catch (e) {
          // A search blip is worth a redelivery decision, not an instant terminal:
          // rethrow transient shapes; anything else degrades to not-found below.
          const detail = e instanceof Error ? e.message : String(e);
          if (!lastAttempt && isRetryableGraphError(detail)) throw e;
          ctx.warn(`[evidence-backfill] $search fallback failed (treating as not found): ${detail}`);
        }
      }
      if (!graphId) {
        await fail('message not found in the mailbox (deleted beyond search, or moved out?)');
        return;
      }

      // 3 — fetch the message + attachments (TKT-047 signature/logo floor applies) and
      //     capture the original as raw `.eml` (best-effort — parity with fetchMessage A0).
      const { message, attachments } = await getMessageWithAttachments(job.sourceMailbox, graphId);

      // 4 — land the bytes in Blob under the CURRENT Graph id (deterministic per attempt;
      //     an id change between attempts is absorbed by the evidence route's TKT-133
      //     (case_id, sha256) dedup — same bytes never become a second row).
      const landed: InboundEnvelope['attachments'] = [];
      const bytesByPath = new Map<string, Buffer>();
      for (const a of attachments) {
        const bytes = Buffer.from(a.contentBytes ?? '', 'base64');
        const up = await uploadEvidenceBytes(graphId, a.name, bytes, a.contentType);
        landed.push({
          filename: a.name,
          contentType: a.contentType,
          blobPath: up.blobPath,
          size: up.size,
          sha256: up.sha256,
        });
        bytesByPath.set(up.blobPath, bytes);
      }
      let rawEml: InboundEnvelope['rawEml'];
      try {
        const mime = await getMessageRawMime(job.sourceMailbox, graphId);
        const emlName = rawEmlFileName(message.internetMessageId ?? job.sourceMessageId);
        const emlUp = await uploadEvidenceBytes(graphId, emlName, mime, 'message/rfc822');
        rawEml = {
          filename: emlName,
          contentType: 'message/rfc822',
          blobPath: emlUp.blobPath,
          size: emlUp.size,
          sha256: emlUp.sha256,
        };
      } catch (e) {
        ctx.warn(
          `[evidence-backfill] raw .eml capture failed for ${job.inboundEmailId} (best-effort): ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }

      // 5 — the EXISTING persist chain: the classifyPersist row assembly + the TKT-064
      //     image-classify stamping (same gate, same per-provider ai_allowed opt-out —
      //     resolved via the TARGET CASE's provider; fail-open on lookup error, exactly
      //     like classifyPersist), then ONE persist through the internal evidence route.
      const rows = buildBaseEvidenceRows({ attachments: landed, ...(rawEml ? { rawEml } : {}) });

      let classifyAllowed = gates.imageRoleClassifyEnabled();
      let caseVrm: string | undefined;
      if (classifyAllowed && rows.some((r) => r.isImage)) {
        try {
          const lookup = await dataApi.casesLookup({ caseIds: [job.targetCaseId] });
          const target = lookup.cases[0];
          caseVrm = target?.vrm || undefined;
          if (target?.workProviderId) {
            const { aiAllowed } = await dataApi.workProviderAiAllowed(target.workProviderId);
            if (aiAllowed === false) {
              classifyAllowed = false;
              ctx.log('[evidence-backfill] image classify skipped — work provider opted out of AI (ai_allowed=false)');
            }
          }
        } catch (e) {
          ctx.log(
            JSON.stringify({
              evt: 'evidenceBackfill.caseLookupFailed',
              caseId: job.targetCaseId,
              err: e instanceof Error ? e.message : String(e),
            }),
          );
        }
      }
      if (classifyAllowed) {
        for (const r of rows) {
          if (!r.isImage) continue;
          try {
            const bytes = bytesByPath.get(r.blobPath);
            if (!bytes) continue; // only classify bytes this run actually landed
            const cls = await classifyImage({
              imageBase64: bytes.toString('base64'),
              contentType: r.contentType,
              caseVrm,
            });
            if (cls) {
              const f = classificationToEvidenceFields(cls, caseVrm);
              r.imageRole = f.imageRole;
              r.registrationVisible = f.registrationVisible;
              r.acceptedForEva = f.acceptedForEva;
              r.personReflection = f.personReflection;
              if (f.excluded) {
                r.excluded = true;
                r.exclusionReason = f.exclusionReason;
              }
            }
          } catch (e) {
            ctx.log(
              JSON.stringify({
                evt: 'evidenceBackfill.imageClassifyFailed',
                caseId: job.targetCaseId,
                file: r.filename,
                err: e instanceof Error ? e.message : String(e),
              }),
            );
          }
        }
      }

      const result = await dataApi.persistEvidence(job.targetCaseId, rows);
      const merged = (result as { merged?: number }).merged;

      // 6 — status recompute AFTER the backfill (the TKT-145 acceptance's second line).
      const status = await dataApi.evaluateStatus(job.targetCaseId);

      // 7 — report completion (the Data API writes the case-scoped audit).
      await dataApi.reportEvidenceBackfill(job.inboundEmailId, {
        outcome: 'completed',
        targetCaseId: job.targetCaseId,
        persisted: result.persisted,
        ...(typeof merged === 'number' ? { merged } : {}),
      });
      ctx.log(
        JSON.stringify({
          evt: 'evidence-backfill',
          inboundEmailId: job.inboundEmailId,
          caseId: job.targetCaseId,
          attachments: landed.length,
          eml: Boolean(rawEml),
          persisted: result.persisted,
          ...(typeof merged === 'number' ? { merged } : {}),
          status: status.value,
        }),
      );
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      if (!lastAttempt && isRetryableGraphError(detail)) {
        ctx.warn(
          `[evidence-backfill] transient failure (attempt ${dequeueCount}/${MAX_DEQUEUE}) — retrying: ${detail}`,
        );
        throw e; // redeliver
      }
      try {
        await fail(detail.slice(0, 300));
      } catch (reportErr) {
        // Last resort: the report failed too — log; the message poisons and the failure
        // stays visible in App Insights (the accept itself already committed).
        ctx.error(
          `[evidence-backfill] terminal failure AND outcome report failed for ${job.inboundEmailId}: ${
            reportErr instanceof Error ? reportErr.message : String(reportErr)
          }`,
        );
      }
    }
  },
});
