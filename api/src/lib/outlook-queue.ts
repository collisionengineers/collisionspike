/**
 * api/src/lib/outlook-queue.ts — enqueue Outlook-move jobs onto the orchestration
 * app's `outlook-move` storage queue (TKT-054 / 020726 E6).
 *
 * Transport: Azure Queue Storage REST with a managed-identity bearer token — NO SDK
 * dependency (mirrors the repo's identity-over-keys posture; shared-key access is
 * disabled on the storage accounts). The Data API's MI needs the
 * `Storage Queue Data Message Sender` role on the orchestration storage account.
 *
 * Token mint follows the App-Service/Functions IDENTITY_ENDPOINT REST contract used by
 * orchestration/src/lib/{data-api,aoai}.ts: `resource=` takes the BARE audience
 * (`https://storage.azure.com`). Local dev has no MI — the enqueue THROWS and the route
 * maps it to a 503 (the SPA button is gated off in that case anyway).
 *
 * Message body: Functions storage-queue triggers expect BASE64-encoded message text
 * (the default `messageEncoding`), so MessageText = base64(JSON).
 *
 * App-settings: OUTLOOK_MOVE_QUEUE_SERVICE_URL (https://<account>.queue.core.windows.net).
 */

import { gates } from './gates.js';

export const OUTLOOK_MOVE_QUEUE_NAME = 'outlook-move';
const STORAGE_RESOURCE = 'https://storage.azure.com';
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

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getStorageToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.value;

  const idEndpoint = process.env.IDENTITY_ENDPOINT;
  const idHeader = process.env.IDENTITY_HEADER;
  if (!idEndpoint || !idHeader) {
    throw new Error('missing IDENTITY_ENDPOINT/IDENTITY_HEADER for storage-queue auth (no managed identity off-Azure)');
  }
  const url = `${idEndpoint}?resource=${encodeURIComponent(STORAGE_RESOURCE)}&api-version=2019-08-01`;
  const res = await fetch(url, { headers: { 'X-IDENTITY-HEADER': idHeader } });
  if (!res.ok) throw new Error(`MSI token (storage) ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_on?: string };
  cachedToken = {
    value: json.access_token,
    expiresAt: json.expires_on ? Number(json.expires_on) * 1000 : now + 3_300_000,
  };
  return cachedToken.value;
}

/** Minimal XML escape for the base64 payload wrapper (base64 never needs it, but safe). */
function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Enqueue one move job. THROWS on any failure — the route maps it to an honest 503
 * and records outlook_move_state='failed' so the SPA never shows a phantom "Filing…".
 */
export async function enqueueOutlookMove(job: OutlookMoveJob): Promise<void> {
  const serviceUrl = gates.outlookMoveQueueServiceUrl().replace(/\/$/, '');
  if (!serviceUrl) throw new Error('OUTLOOK_MOVE_QUEUE_SERVICE_URL not configured');

  const token = await getStorageToken();
  const messageText = Buffer.from(JSON.stringify(job), 'utf8').toString('base64');
  const res = await fetch(`${serviceUrl}/${OUTLOOK_MOVE_QUEUE_NAME}/messages`, {
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
    throw new Error(`outlook-move enqueue → ${res.status}: ${detail.slice(0, 300)}`);
  }
}
