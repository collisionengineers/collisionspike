/**
 * services/data-api/src/features/inbound/outlook-queue.ts — enqueue Outlook-move jobs onto the orchestration
 * app's `outlook-move` storage queue (TKT-054 / 020726 E6).
 *
 * Transport: Azure Queue Storage REST with a managed-identity bearer token — NO SDK
 * dependency (mirrors the repo's identity-over-keys posture; shared-key access is
 * disabled on the storage accounts). The Data API's MI needs the
 * `Storage Queue Data Message Sender` role on the orchestration storage account.
 *
 * Token mint is the shared `@cs/server-runtime` storage wrapper (TKT-250); `resource=` takes the BARE
 * audience (`STORAGE_RESOURCE`, deliberately without the Blob sites' trailing slash). Local dev has no
 * MI — the mint THROWS (its message still names IDENTITY_ENDPOINT, so `classifyEnqueueFailure` still
 * maps it to `no_identity`) and the route maps it to a 503 (the SPA button is gated off anyway).
 *
 * Message body: Functions storage-queue triggers expect BASE64-encoded message text
 * (the default `messageEncoding`), so MessageText = base64(JSON).
 *
 * App-settings: OUTLOOK_MOVE_QUEUE_SERVICE_URL (https://<account>.queue.core.windows.net).
 */

import { STORAGE_RESOURCE, storageManagedIdentityToken } from '@cs/server-runtime';
import { gates } from '../settings/gates.js';

export const OUTLOOK_MOVE_QUEUE_NAME = 'outlook-move';
/** Entra (OAuth) auth on Queue REST requires x-ms-version >= 2017-11-09. */
const STORAGE_API_VERSION = '2021-12-02';

/** The job the orchestration mover consumes — keep in sync with outlook-move.ts. */
export interface OutlookMoveJob {
  inboundEmailId: string;
  sourceMailbox: string;
  /** RFC Internet-Message-Id (inbound_email.source_message_id) — the mover resolves
   *  the current Graph message id from it ($filter=internetMessageId eq …). */
  sourceMessageId: string;
  /** Destination path under the mailbox root, e.g. Inbox/Instructions. */
  targetFolderPath: string;
}

/** Minimal XML escape for the base64 payload wrapper (base64 never needs it, but safe). */
function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Shared queue-enqueue core (TKT-145 extracted it from enqueueOutlookMove so the
 * `evidence-backfill` queue could reuse the identical MI-token + Queue REST mechanics —
 * lib/evidence-backfill-queue.ts). THROWS on any failure; the error text keeps the
 * `<queue> enqueue → <status>: <detail>` shape {@link classifyEnqueueFailure} matches on.
 */
export async function enqueueQueueMessage(
  serviceUrlRaw: string,
  queueName: string,
  payload: unknown,
): Promise<void> {
  const serviceUrl = serviceUrlRaw.replace(/\/$/, '');
  if (!serviceUrl) throw new Error('queue service URL not configured');

  // Bearer STRING for the BARE storage audience (raw REST producer — no storage SDK) — TKT-250 wrapper.
  const { token } = await storageManagedIdentityToken({ audience: STORAGE_RESOURCE });
  const messageText = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  const res = await fetch(`${serviceUrl}/${queueName}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-ms-version': STORAGE_API_VERSION,
      'Content-Type': 'application/xml',
    },
    body: `<QueueMessage><MessageText>${xmlEscape(messageText)}</MessageText></QueueMessage>`,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${queueName} enqueue → ${res.status}: ${detail.slice(0, 300)}`);
  }
}

/**
 * Enqueue one move job. THROWS on any failure — the route maps it to an honest 503
 * and records outlook_move_state='failed' so the SPA never shows a phantom "Filing…".
 */
export async function enqueueOutlookMove(job: OutlookMoveJob): Promise<void> {
  const serviceUrl = gates.outlookMoveQueueServiceUrl();
  if (!serviceUrl) throw new Error('OUTLOOK_MOVE_QUEUE_SERVICE_URL not configured');
  await enqueueQueueMessage(serviceUrl, OUTLOOK_MOVE_QUEUE_NAME, job);
}

/** Machine-readable enqueue-failure classes (TKT-091) + the plain-English line the SPA
 *  shows for each (no engineering vocabulary rendered). */
export interface EnqueueFailureClass {
  reason: 'queue_missing' | 'not_authorised' | 'not_configured' | 'no_identity' | 'unavailable';
  /** Staff-facing sentence — rendered verbatim by the SPA. */
  message: string;
}

/**
 * TKT-091 — classify an {@link enqueueOutlookMove} throw so the route can return a
 * machine-readable reason (and the SPA a readable sentence) instead of a bare 503.
 * The live 2026-07-06 failure was `queue_missing` (404 QueueNotFound — the
 * `outlook-move` queue had never been provisioned on the orchestration storage
 * account), which dev-tools showed only as "503 Service Unavailable".
 */
export function classifyEnqueueFailure(e: unknown): EnqueueFailureClass {
  const text = e instanceof Error ? e.message : String(e ?? '');
  if (/QueueNotFound|→ 404/.test(text)) {
    return {
      reason: 'queue_missing',
      message: 'Outlook filing is not fully set up yet — the filing queue is missing. Ask the administrator.',
    };
  }
  if (/AuthorizationFailure|AuthorizationPermissionMismatch|→ 403/.test(text)) {
    return {
      reason: 'not_authorised',
      message: 'Outlook filing is not fully set up yet — a permission is missing. Ask the administrator.',
    };
  }
  if (/not configured/.test(text)) {
    return {
      reason: 'not_configured',
      message: 'Outlook filing is not fully set up yet — ask the administrator.',
    };
  }
  if (/IDENTITY_ENDPOINT/.test(text)) {
    return {
      reason: 'no_identity',
      message: 'Outlook filing is unavailable in this environment.',
    };
  }
  return {
    reason: 'unavailable',
    message: 'Outlook filing is temporarily unavailable — try again in a moment.',
  };
}
