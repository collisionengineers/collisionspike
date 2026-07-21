/** *
 * Queue trigger: drains the `outlook-move` storage queue — one job per staff click of
 * the inbox "Suggested action" button (enqueued by the Data API's
 * POST /api/inbound/{id}/outlook-move; payload shape shared via that route's
 * OutlookMoveJob doc). Performs the ACTUAL Graph move of the message inside the shared
 * mailbox:
 *
 *   1. gate check — OUTLOOK_MOVE_ENABLED (kill-switch; a gate flipped off between
 *      enqueue and dequeue reports `failed`, never moves);
 *   2. resolve the CURRENT Graph message id from the stored Internet-Message-Id
 *      ($filter — a Graph id changes when a message moves, so never trust a stored one);
 *   3. walk/create the destination child-folder chain under Inbox;
 *   4. POST /move;
 *   5. report `moved`/`failed` back to the Data API
 *      (POST /api/internal/inbound/{id}/outlook-moved), which stamps the row + audit.
 *
 * Permission state (verified live 2026-07-21 — this comment previously claimed a Mail.Read-only grant
 * under which the move POST would 403; that was WRONG): the Graph Intake app registration holds
 * `Application Mail.ReadWrite` via Exchange Online RBAC over all three intake mailboxes, so the move
 * POST would SUCCEED. Nothing here is permission-blocked. `OUTLOOK_MOVE_ENABLED` (below) is the only
 * thing preventing a live mailbox mutation — treat it as a real kill switch, not a belt-and-braces one.
 *
 * Retry semantics: a TRANSIENT error (Graph 5xx/429/network) rethrows so the queue
 * redelivers (up to the ~5-dequeue poison limit); on the LAST attempt — or any
 * non-retryable failure (gate off, message not found, 4xx) — the terminal `failed`
 * outcome is reported instead. The report itself is best-effort: if even that fails on
 * the last attempt the message poisons and the row stays `queued` (visibly stuck, the
 * SPA offers retry).
 */

import { app, type InvocationContext } from '@azure/functions';
import { gates } from '@cs/domain/gates';
import { outlookFolderSegments } from '@cs/domain';
import {
  ensureInboxChildFolder,
  findMessageByInternetMessageId,
  moveMessage,
} from '../../adapters/graph.js';
import { dataApi } from '../../adapters/data-api.js';

interface OutlookMoveJob {
  inboundEmailId: string;
  sourceMailbox: string;
  sourceMessageId: string;
  targetFolderPath: string;
}

/** Graph statuses worth a queue retry (throttle/transient); 4xx are terminal. */
export function isRetryableGraphError(message: string): boolean {
  return /→ (429|5\d\d)\b/.test(message) || /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(message);
}

const MAX_DEQUEUE = 5; // host.json default maxDequeueCount

app.storageQueue('outlook-move', {
  queueName: 'outlook-move',
  connection: 'AzureWebJobsStorage',
  handler: async (item: unknown, ctx: InvocationContext): Promise<void> => {
    const job = (typeof item === 'string' ? JSON.parse(item) : item) as OutlookMoveJob;
    const dequeueCount = Number(ctx.triggerMetadata?.dequeueCount ?? 1);
    const lastAttempt = dequeueCount >= MAX_DEQUEUE;

    const fail = async (detail: string): Promise<void> => {
      ctx.warn(`[outlook-move] ${job.inboundEmailId}: ${detail}`);
      await dataApi.reportOutlookMove(job.inboundEmailId, {
        outcome: 'failed',
        folder: job.targetFolderPath,
        detail,
      });
    };

    try {
      if (!job.inboundEmailId || !job.sourceMailbox || !job.sourceMessageId) {
        // Malformed job — nothing to report against; log and drop (never poison-loop).
        ctx.error(`[outlook-move] malformed job dropped: ${JSON.stringify(job).slice(0, 300)}`);
        return;
      }
      if (!gates.outlookMove()) {
        await fail('outlook filing was switched off before the move ran');
        return;
      }

      const found = await findMessageByInternetMessageId(job.sourceMailbox, job.sourceMessageId);
      if (!found) {
        await fail('message not found in the mailbox (deleted or already moved elsewhere?)');
        return;
      }

      const segments = outlookFolderSegments(job.targetFolderPath);
      const destinationId = segments.length
        ? await ensureInboxChildFolder(job.sourceMailbox, segments)
        : 'inbox';
      await moveMessage(job.sourceMailbox, found.id, destinationId);

      await dataApi.reportOutlookMove(job.inboundEmailId, {
        outcome: 'moved',
        folder: job.targetFolderPath,
      });
      ctx.log(
        JSON.stringify({
          evt: 'outlook-move',
          inboundEmailId: job.inboundEmailId,
          mailbox: job.sourceMailbox,
          folder: job.targetFolderPath,
        }),
      );
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      if (!lastAttempt && isRetryableGraphError(detail)) {
        ctx.warn(`[outlook-move] transient failure (attempt ${dequeueCount}/${MAX_DEQUEUE}) — retrying: ${detail}`);
        throw e; // redeliver
      }
      try {
        await fail(detail.slice(0, 300));
      } catch (reportErr) {
        // Last resort: report failed too — log; the row stays 'queued' (SPA offers retry).
        ctx.error(
          `[outlook-move] terminal failure AND outcome report failed for ${job.inboundEmailId}: ${
            reportErr instanceof Error ? reportErr.message : String(reportErr)
          }`,
        );
      }
    }
  },
});
