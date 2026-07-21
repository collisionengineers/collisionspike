/** *
 * LOCAL-ONLY intake poller (TKT-299, PLAN-015 Slice B): a timer that pulls new Inbox
 * message ids per configured mailbox via listMessageIdsSince and feeds the normal
 * `intake-messages` queue in the lifecycle-resync shape — the pull twin of the push
 * webhook, for a shadow instance that has no public notification endpoint.
 *
 * DOUBLY DARK, never set live: requires INTAKE_POLL_ENABLED *and* a non-empty
 * INTAKE_POLL_MAILBOXES (its own variable — deliberately NOT GRAPH_INTAKE_MAILBOXES, so
 * the live app stays inert even if the boolean were flipped by mistake, and the shadow
 * keeps GRAPH_INTAKE_MAILBOXES=[] so subscription maintenance never runs). Live intake
 * remains push-only.
 *
 * Doctrine (pure pieces + tests in platform/intake-poll-core.ts):
 *   - mailboxes strictly SEQUENTIAL — Graph allows 4 concurrent requests per
 *     app+mailbox and the retro drains already proved concurrent access trips
 *     ApplicationThrottled/MailboxConcurrency;
 *   - per-mailbox watermark = max(persisted, minIntakeDate), persisted as a small JSON
 *     blob in the `intake-poll-state` container (Azurite locally via
 *     EVIDENCE_BLOB_CONNECTION), advanced only after a page's ids are in the sink;
 *   - the `ge` filter re-returns the boundary message every run — DELIBERATE: overlap
 *     is dedup-safe (intake-{messageId} instance ids + UNIQUE(sourcemessageid)), and it
 *     doubles as the no-progress page-loop breaker;
 *   - INTAKE_POLL_MAX_PAGES caps one tick's catch-up; the next tick continues.
 *
 * One mailbox's failure never blocks the others; the tick reports per-mailbox telemetry.
 */

import { app, output, type InvocationContext, type Timer } from '@azure/functions';
import { BlobServiceClient } from '@azure/storage-blob';
import { gates } from '@cs/domain/gates';
import { STORAGE_RESOURCE_TRAILING_SLASH, storageManagedIdentityCredential } from '@cs/server-runtime';
import { listMessageIdsSince } from '../../adapters/graph.js';
import {
  INTAKE_POLL_MAX_PAGES,
  INTAKE_POLL_PAGE_SIZE,
  effectiveWatermark,
  maxIso,
  parsePollMailboxes,
  parseWatermarkBlob,
  resyncQueueMessage,
  watermarkBlobContent,
  type PollMailboxConfig,
} from '../../platform/intake-poll-core.js';

const intakeQueue = output.storageQueue({
  queueName: 'intake-messages',
  connection: 'AzureWebJobsStorage',
});

/* ---- watermark state store (same account/credential posture as platform/blob.ts,
        its own container so poll state never mingles with evidence bytes) ---- */

const STATE_CONTAINER = 'intake-poll-state';

let cachedClient: BlobServiceClient | null = null;
function client(): BlobServiceClient {
  if (cachedClient) return cachedClient;
  const account = process.env.EVIDENCE_BLOB_ACCOUNT;
  if (account) {
    cachedClient = new BlobServiceClient(
      `https://${account}.blob.core.windows.net`,
      storageManagedIdentityCredential({ audience: STORAGE_RESOURCE_TRAILING_SLASH }),
    );
    return cachedClient;
  }
  const conn = process.env.EVIDENCE_BLOB_CONNECTION;
  if (!conn) throw new Error('missing EVIDENCE_BLOB_ACCOUNT (MI) or EVIDENCE_BLOB_CONNECTION');
  cachedClient = BlobServiceClient.fromConnectionString(conn);
  return cachedClient;
}

function stateBlobName(mailbox: string): string {
  return `${mailbox.replace(/[^A-Za-z0-9._@-]/g, '_')}.json`;
}

async function readStateBlob(mailbox: string): Promise<string | null> {
  try {
    const blob = client().getContainerClient(STATE_CONTAINER).getBlockBlobClient(stateBlobName(mailbox));
    const buf = await blob.downloadToBuffer();
    return buf.toString('utf8');
  } catch {
    return null; // absent or unreadable → reset-to-floor semantics (core doctrine)
  }
}

async function writeStateBlob(mailbox: string, watermark: string): Promise<void> {
  const container = client().getContainerClient(STATE_CONTAINER);
  await container.createIfNotExists();
  const content = watermarkBlobContent(mailbox, watermark, new Date().toISOString());
  await container
    .getBlockBlobClient(stateBlobName(mailbox))
    .upload(content, Buffer.byteLength(content), {
      blobHTTPHeaders: { blobContentType: 'application/json' },
    });
}

/* ---- the timer ---- */

app.timer('intake-poll', {
  schedule: process.env.INTAKE_POLL_CRON || '0 */2 * * * *',
  extraOutputs: [intakeQueue],
  handler: async (_timer: Timer, ctx: InvocationContext): Promise<void> => {
    if (!gates.intakePoll()) return; // dark default — silent no-op on every tick
    const mailboxes = parsePollMailboxes(gates.intakePollMailboxes());
    if (!mailboxes.length) {
      ctx.log('[intake-poll] INTAKE_POLL_ENABLED is on but INTAKE_POLL_MAILBOXES is empty/malformed — nothing to poll');
      return;
    }

    const sink: string[] = [];
    for (const cfg of mailboxes) {
      // Strictly sequential across mailboxes AND pages (the 4-concurrent throttle).
      try {
        await pollMailbox(cfg, sink, ctx);
      } catch (e) {
        ctx.error(`[intake-poll] ${cfg.mailbox}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    ctx.extraOutputs.set(intakeQueue, sink);
  },
});

async function pollMailbox(cfg: PollMailboxConfig, sink: string[], ctx: InvocationContext): Promise<void> {
  const persisted = parseWatermarkBlob(await readStateBlob(cfg.mailbox));
  let watermark = effectiveWatermark(persisted, cfg.minIntakeDate);
  let pages = 0;
  let enqueued = 0;

  while (pages < INTAKE_POLL_MAX_PAGES) {
    const { ids, newWatermark } = await listMessageIdsSince(cfg.mailbox, watermark);
    for (const id of ids) sink.push(resyncQueueMessage(cfg.mailbox, id, new Date().toISOString()));
    enqueued += ids.length;
    pages += 1;

    const advanced = maxIso(newWatermark, watermark) !== watermark;
    watermark = maxIso(newWatermark, watermark); // never backwards
    await writeStateBlob(cfg.mailbox, watermark);

    // Short page => caught up; no timestamp progress => same-instant page (or idle
    // boundary re-read) — either way the next tick resumes from the watermark.
    if (ids.length < INTAKE_POLL_PAGE_SIZE || !advanced) break;
  }

  ctx.log(JSON.stringify({ evt: 'intake-poll', mailbox: cfg.mailbox, enqueued, pages, watermark }));
}
