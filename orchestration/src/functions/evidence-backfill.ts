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
 *      dataApi.persistEvidence (the internal evidence route, whose merge-lineage
 *      guard redirects only a retired target to its verified survivor, and whose
 *      TKT-133 (case_id, sha256) dedup/LINK makes replays and double-accepts safe);
 *   6. status recompute (dataApi.evaluateStatus — the acceptance's second line);
 *   7. report `completed`/`partial`/`failed` back to the Data API
 *      (POST /api/internal/inbound/{id}/evidence-backfill): `completed` writes the
 *      case-scoped attachment_classified audit; `failed` writes the durable
 *      "Attachments to add" staff note (the TKT-145 INVERSION of the always-note
 *      interim mitigation) + a warning audit.
 *
 * Retry semantics (the outlook-move.ts split, strengthened for mailbox convergence): a
 * TRANSIENT error (Graph/API 5xx/429/network), a message/attachment/raw-MIME null/404,
 * or an incomplete/cyclic page rethrows so the queue redelivers and re-resolves the
 * current Graph id. Individual stale 404 subject-search candidates are skipped while
 * later candidates are corroborated. On the LAST attempt — or any genuinely terminal
 * failure — `failed`/`partial` is reported so the note lands. The report itself is best-effort: if even
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
import { attachmentBlobFileName, rawEmlFileName } from '../lib/evidence-names.js';
import { classifyImage, classificationToEvidenceFields } from '../lib/image-classify.js';
import { buildBaseEvidenceRows } from './activities/classifyPersist.js';
import type { InboundEnvelope } from './activities/fetchMessage.js';
import {
  dataApi,
  EvidenceBackfillReclassificationRequiredError,
  EvidenceBackfillTargetChangedError,
} from '../lib/data-api.js';
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
const SEARCH_CANDIDATE_CAP = 100;

class RetryableBackfillFetchError extends Error {}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Backfill has stricter recovery semantics than ordinary Graph calls. A moved
 * message/attachment can briefly return null or 404 while Graph converges, and a
 * later-page failure must not turn a truncated collection into success. Candidate
 * corroboration deliberately continues using `isRetryableGraphError` directly so an
 * individual stale 404 hit remains a skip rather than poisoning the whole search.
 */
function isRetryableBackfillFetchError(error: unknown): boolean {
  if (error instanceof RetryableBackfillFetchError) return true;
  const detail = errorDetail(error);
  return (
    isRetryableGraphError(detail) ||
    /graph\b[^\n]*→ 404\b/i.test(detail) ||
    /graph\b[^\n]*pagination\b/i.test(detail) ||
    /graph\b[^\n]*(?:null|empty|missing|incomplete)\b/i.test(detail) ||
    /attachment (?:identity|response) missing/i.test(detail)
  );
}

/** Azure Storage SDK / transport failures worth queue redelivery before any
 * evidence row is committed. Client validation/auth/not-found 4xx stay terminal. */
export function isRetryableStorageInfrastructureError(error: unknown): boolean {
  let cursor: unknown = error;
  const seen = new Set<unknown>();
  for (let depth = 0; cursor != null && depth < 5 && !seen.has(cursor); depth++) {
    seen.add(cursor);
    const candidate = (typeof cursor === 'object')
      ? cursor as {
          statusCode?: unknown;
          status?: unknown;
          code?: unknown;
          name?: unknown;
          cause?: unknown;
        }
      : {};
    const status = Number(candidate.statusCode ?? candidate.status);
    if (Number.isFinite(status) && (status === 429 || status >= 500)) return true;

    const code = String(candidate.code ?? candidate.name ?? '');
    if (/^(?:ServerBusy|InternalError|OperationTimedOut|ServiceUnavailable|TooManyRequests|ManagedIdentityTokenError|ECONNRESET|ETIMEDOUT|ESOCKETTIMEDOUT|EAI_AGAIN)$/i.test(code)) {
      // A managed-identity error is retryable only when its status/message says
      // throttling or service failure; ordinary named transport codes are retryable.
      if (!/^ManagedIdentityTokenError$/i.test(code) ||
          /MSI storage token (?:429|5\d\d)\b/i.test(errorDetail(cursor)) ||
          status === 429 || status >= 500) return true;
    }
    if (/\b(?:MSI storage token (?:429|5\d\d)|ServerBusy|ServiceUnavailable|TooManyRequests|ECONNRESET|ETIMEDOUT|ESOCKETTIMEDOUT|EAI_AGAIN)\b/i
      .test(errorDetail(cursor))) return true;
    cursor = candidate.cause;
  }
  return false;
}

function isRetryableBackfillInfrastructureError(error: unknown): boolean {
  return isRetryableBackfillFetchError(error) || isRetryableStorageInfrastructureError(error);
}

/**
 * Whole-mailbox `$search` fallback (gated RETRO_OUTLOOK_SEARCH_ENABLED by the caller):
 * search on the email's SUBJECT (Graph $search cannot filter on internetMessageId — its
 * un-propertied scope is from/subject/body), then corroborate every candidate by fetching
 * its internetMessageId and requiring an EXACT match on the stored id. A terminal
 * per-candidate miss is skipped. Retryable candidate failures are remembered: a
 * later exact match still wins, otherwise the transient is rethrown for redelivery.
 */
export async function locateBySubjectSearch(
  mailbox: string,
  subject: string,
  internetMessageId: string,
): Promise<string | null> {
  const phrase = (subject ?? '').trim();
  if (!phrase) return null;
  const hits = await searchMessages(mailbox, kqlPhrase(phrase), SEARCH_CANDIDATE_CAP);
  let retryableFailure: unknown;
  for (const h of hits) {
    try {
      const msg = await graphFetch<{ internetMessageId?: string }>(
        `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(h.id)}` +
          `?$select=internetMessageId`,
      );
      if ((msg.internetMessageId ?? '') === internetMessageId) return h.id;
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      if (retryableFailure === undefined && isRetryableGraphError(detail)) {
        retryableFailure = e;
      }
      // A terminal candidate failure (for example 404) is just one stale search
      // hit. A remembered transient is deferred until all later candidates have
      // had the chance to corroborate successfully.
    }
  }
  if (retryableFailure !== undefined) throw retryableFailure;
  return null;
}

app.storageQueue('evidence-backfill', {
  queueName: 'evidence-backfill',
  connection: 'AzureWebJobsStorage',
  handler: async (item: unknown, ctx: InvocationContext): Promise<void> => {
    const job = (typeof item === 'string' ? JSON.parse(item) : item) as EvidenceBackfillJob;
    const dequeueCount = Number(ctx.triggerMetadata?.dequeueCount ?? 1);
    const lastAttempt = dequeueCount >= MAX_DEQUEUE;
    let targetValidated = false;
    let persistenceCommitted = false;
    let reportAttempted = false;
    let targetCaseId = job.targetCaseId;

    const report = async (payload: Parameters<typeof dataApi.reportEvidenceBackfill>[1]): Promise<void> => {
      reportAttempted = true;
      await dataApi.reportEvidenceBackfill(job.inboundEmailId, payload);
    };

    const fail = async (detail: string): Promise<void> => {
      ctx.warn(`[evidence-backfill] ${job.inboundEmailId}: ${detail}`);
      await report({
        outcome: 'failed',
        targetCaseId,
        detail,
      });
    };

    try {
      if (!job.inboundEmailId || !job.targetCaseId) {
        // Nothing to report against — log and drop (never poison-loop a malformed job).
        ctx.error(`[evidence-backfill] malformed job dropped: ${JSON.stringify(job).slice(0, 300)}`);
        return;
      }
      const validated = await dataApi.validateEvidenceBackfillTarget(job.inboundEmailId, targetCaseId);
      targetCaseId = validated.targetCaseId;
      targetValidated = true;
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
          const detail = errorDetail(e);
          if (!lastAttempt && isRetryableBackfillFetchError(e)) throw e;
          ctx.warn(`[evidence-backfill] $search fallback failed (treating as not found): ${detail}`);
        }
      }
      if (!graphId) {
        if (!lastAttempt) {
          throw new RetryableBackfillFetchError(
            'graph message lookup returned no exact match; retry after mailbox convergence',
          );
        }
        await fail('message not found in the mailbox (deleted beyond search, or moved out?)');
        return;
      }

      // 3 — fetch the message + attachments (TKT-047 signature/logo floor applies) and
      //     capture the original as raw `.eml` (best-effort — parity with fetchMessage A0).
      const fetched = await getMessageWithAttachments(job.sourceMailbox, graphId);
      if (!fetched?.message || !Array.isArray(fetched.attachments)) {
        throw new RetryableBackfillFetchError(
          'graph message/attachment response was incomplete; retry after mailbox convergence',
        );
      }
      const { message } = fetched;
      const attachmentFailures = [...(fetched.attachmentFailures ?? [])];
      const attachments = fetched.attachments.filter((a) => {
        if (!a) {
          attachmentFailures.push({
            id: '',
            name: '',
            contentType: 'application/octet-stream',
            reason: 'attachment response missing',
          });
          return false;
        }
        if ((a.id ?? '').trim()) return true;
        attachmentFailures.push({
          id: '',
          name: a.name ?? '',
          contentType: a.contentType ?? 'application/octet-stream',
          reason: 'attachment identity missing',
        });
        return false;
      });
      const retryableAttachmentFailure = attachmentFailures.find((f) =>
        isRetryableBackfillFetchError(f.reason));
      if (retryableAttachmentFailure && !lastAttempt) throw new Error(retryableAttachmentFailure.reason);

      // 4 — land the bytes in Blob under the CURRENT Graph id (deterministic per attempt;
      //     an id change between attempts is absorbed by the evidence route's TKT-133
      //     (case_id, sha256) dedup — same bytes never become a second row).
      const landed: InboundEnvelope['attachments'] = [];
      const bytesByPath = new Map<string, Buffer>();
      for (const a of attachments) {
        const bytes = Buffer.from(a.contentBytes ?? '', 'base64');
        const up = await uploadEvidenceBytes(
          graphId,
          attachmentBlobFileName(a.id, a.name),
          bytes,
          a.contentType,
        );
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
      let rawMimeFailure: string | null = null;
      try {
        const mime = await getMessageRawMime(job.sourceMailbox, graphId);
        if (!Buffer.isBuffer(mime) || mime.length === 0) {
          throw new RetryableBackfillFetchError(
            'graph raw MIME response was empty; retry after mailbox convergence',
          );
        }
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
        if (!lastAttempt && isRetryableBackfillInfrastructureError(e)) throw e;
        rawMimeFailure = errorDetail(e).slice(0, 300);
        ctx.warn(
          `[evidence-backfill] raw .eml capture failed for ${job.inboundEmailId} (best-effort): ${
            errorDetail(e)
          }`,
        );
      }

      // 5 — the EXISTING persist chain: the classifyPersist row assembly + the TKT-064
      //     image-classify stamping (same gate, same per-provider ai_allowed opt-out —
      //     resolved via the TARGET CASE's provider; fail-closed on either case/provider
      //     policy lookup error), then ONE persist through the internal evidence route.
      const rows = buildBaseEvidenceRows({ attachments: landed, ...(rawEml ? { rawEml } : {}) });

      const classificationRequested = gates.imageRoleClassifyEnabled() && rows.some((r) => r.isImage);
      let classifyAllowed = false;
      let caseVrm: string | undefined;
      if (classificationRequested) {
        try {
          const lookup = await dataApi.casesLookup({ caseIds: [targetCaseId] });
          const target = lookup.cases[0];
          if (!target) throw new Error('target case unavailable for classification policy');
          caseVrm = target?.vrm || undefined;
          if (target?.workProviderId) {
            const { aiAllowed } = await dataApi.workProviderAiAllowed(target.workProviderId);
            classifyAllowed = aiAllowed !== false;
            if (!classifyAllowed) {
              ctx.log('[evidence-backfill] image classify skipped — work provider opted out of AI (ai_allowed=false)');
            }
          } else {
            classifyAllowed = true;
          }
        } catch (e) {
          classifyAllowed = false;
          ctx.log(
            JSON.stringify({
              evt: 'evidenceBackfill.caseLookupFailed',
              caseId: targetCaseId,
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
              r.excluded = f.excluded;
              r.exclusionReason = f.exclusionReason ?? null;
              r.decisionSource = 'classifier';
              r.personReflection = f.personReflection;
            }
          } catch (e) {
            ctx.log(
              JSON.stringify({
                evt: 'evidenceBackfill.imageClassifyFailed',
                caseId: targetCaseId,
                file: r.filename,
                err: e instanceof Error ? e.message : String(e),
              }),
            );
          }
        }
      }

      const result = await dataApi.persistEvidence(targetCaseId, rows, {
        expectedInboundEmailId: job.inboundEmailId,
      });
      persistenceCommitted = true;
      targetCaseId = result.targetCaseId ?? targetCaseId;
      const merged = (result as { merged?: number }).merged;

      // 6 — opportunistic status fast-path AFTER the committed backfill. When the
      // evidence transaction returned a generation, the API evaluates + acknowledges
      // that generation atomically under the case-row lock. A transient failure here
      // must NOT turn committed evidence into a failed backfill: the durable generation
      // remains pending for the sweep.
      let statusValue = 'recompute_pending';
      try {
        const status = await dataApi.evaluateStatus(targetCaseId, result.statusGeneration);
        if (result.statusGeneration != null && status.completed !== true) {
          throw new Error(
            `status generation ${result.statusGeneration} was evaluated but not acknowledged`,
          );
        }
        statusValue = status.value;
      } catch (e) {
        ctx.warn(
          `[evidence-backfill] evidence committed; immediate status evaluation remains pending for ` +
            `${targetCaseId}: ${errorDetail(e)}`,
        );
      }

      // 7 — report completion (the Data API writes the case-scoped audit).
      const recoveryFailures = attachmentFailures.length + (rawMimeFailure ? 1 : 0);
      await report({
        outcome: recoveryFailures > 0 ? 'partial' : 'completed',
        targetCaseId,
        persisted: result.persisted,
        ...(typeof merged === 'number' ? { merged } : {}),
        ...(recoveryFailures > 0
          ? {
              failedAttachments: recoveryFailures,
              detail: `${recoveryFailures} recovery item${recoveryFailures === 1 ? '' : 's'} could not be retrieved`,
            }
          : {}),
      });
      ctx.log(
        JSON.stringify({
          evt: 'evidence-backfill',
          inboundEmailId: job.inboundEmailId,
          caseId: targetCaseId,
          attachments: landed.length,
          eml: Boolean(rawEml),
          persisted: result.persisted,
          ...(typeof merged === 'number' ? { merged } : {}),
          status: statusValue,
        }),
      );
    } catch (e) {
      const detail = errorDetail(e);
      if (
        e instanceof EvidenceBackfillReclassificationRequiredError &&
        !persistenceCommitted &&
        !reportAttempted
      ) {
        targetCaseId = e.targetCaseId ?? targetCaseId;
        if (!lastAttempt) {
          ctx.warn(
            `[evidence-backfill] case ownership changed during classification; retrying against ` +
              `${targetCaseId} (attempt ${dequeueCount}/${MAX_DEQUEUE})`,
          );
          throw e;
        }
        await fail('case ownership changed during attachment classification; staff must add any missing attachments');
        return;
      }
      if (e instanceof EvidenceBackfillTargetChangedError && !persistenceCommitted && !reportAttempted) {
        ctx.warn(`[evidence-backfill] stale target dropped for ${job.inboundEmailId}`);
        return;
      }
      if (reportAttempted || persistenceCommitted || !targetValidated) throw e;
      if (!lastAttempt && isRetryableBackfillInfrastructureError(e)) {
        ctx.warn(
          `[evidence-backfill] transient failure (attempt ${dequeueCount}/${MAX_DEQUEUE}) — retrying: ${detail}`,
        );
        throw e; // redeliver
      }
      await fail(detail.slice(0, 300));
    }
  },
});
