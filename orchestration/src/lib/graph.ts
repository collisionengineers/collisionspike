/**
 * orchestration/src/lib/graph.ts
 *
 * Microsoft Graph helpers for the intake-subscription path (plan 22 §A).
 *
 * Auth: daemon (no-user) client-credentials against the tenant, scope
 * `https://graph.microsoft.com/.default` — the `cespk-graph-intake` app
 * registration with application permission `Mail.Read` (plan 22 §A.1).
 *
 * Dependency-free: the client-credentials token is fetched directly from the
 * Entra v2 token endpoint with `fetch` (no @azure/identity / @azure/msal-node),
 * keeping the orchestration's dependency surface to @azure/functions +
 * durable-functions + @azure/storage-blob.
 *
 * App-settings required: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET.
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

/* ---------- token (client-credentials, cached until ~60 s before expiry) ---------- */

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Acquire (and briefly cache) a client-credentials token for Microsoft Graph. */
export async function getGraphToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.value;
  }

  const tenant = requireEnv('GRAPH_TENANT_ID');
  const clientId = requireEnv('GRAPH_CLIENT_ID');
  const clientSecret = requireEnv('GRAPH_CLIENT_SECRET');

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`graph token endpoint ${res.status}: ${await safeText(res)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

/* ---------- generic Graph request ---------- */

/** Issue an authenticated Graph request and return the parsed JSON body. */
export async function graphFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getGraphToken();
  const url = path.startsWith('http') ? path : `${GRAPH_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`graph ${init.method ?? 'GET'} ${path} → ${res.status}: ${await safeText(res)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ---------- message + attachments ---------- */

export interface GraphAttachment {
  '@odata.type'?: string;
  id: string;
  name: string;
  contentType: string;
  size: number;
  /** Base64 bytes (present on #microsoft.graph.fileAttachment). */
  contentBytes?: string;
  isInline?: boolean;
}

export interface GraphMessage {
  id: string;
  internetMessageId?: string;
  subject?: string;
  receivedDateTime?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  hasAttachments?: boolean;
}

export interface FetchedMessage {
  message: GraphMessage;
  attachments: GraphAttachment[];
}

/**
 * Fetch a message and its file attachments for a given mailbox.
 * `mailbox` is the UPN/address the subscription `resource` is scoped to (plan 22 §A.2);
 * the daemon reads it via `users/{mailbox}/messages/{id}`.
 */
export async function getMessageWithAttachments(
  mailbox: string,
  messageId: string,
): Promise<FetchedMessage> {
  const base = `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}`;
  // Prefer the plain-text body representation so message.body.content is text, not HTML
  // (the classifier + the body-as-instruction path want text; Graph defaults to HTML).
  const message = await graphFetch<GraphMessage>(base, {
    headers: { Prefer: 'outlook.body-content-type="text"' },
  });
  const attachments: GraphAttachment[] = [];
  if (message.hasAttachments) {
    const list = await graphFetch<{ value: GraphAttachment[] }>(`${base}/attachments`);
    for (const a of list.value ?? []) {
      if (a.isInline === true) continue;
      const otype = (a['@odata.type'] ?? '').toLowerCase();
      if (a.contentBytes !== undefined) {
        // A normal fileAttachment with inline base64 bytes — the common case.
        attachments.push(a);
        continue;
      }
      // No contentBytes: either an ITEM attachment (a forwarded message — the
      // instruction often arrives this way and was previously DROPPED, so the
      // parser saw nothing → the "only registration" symptom) or a large
      // fileAttachment whose bytes Graph omitted. Both are fetchable via `$value`.
      // Best-effort: a fetch failure skips that one attachment, never the message.
      try {
        const raw = await getAttachmentRawValue(mailbox, messageId, a.id);
        if (otype.includes('itemattachment')) {
          // The embedded item's MIME — land it as a parseable/archivable `.eml`.
          attachments.push({
            ...a,
            name: ensureEmlName(a.name),
            contentType: 'message/rfc822',
            size: raw.length,
            contentBytes: raw.toString('base64'),
          });
        } else {
          attachments.push({ ...a, size: raw.length, contentBytes: raw.toString('base64') });
        }
      } catch {
        /* best-effort — a forwarded/large attachment we cannot fetch is skipped */
      }
    }
  }
  return { message, attachments };
}

/** Append `.eml` to an item-attachment name (forwarded items often have no extension). */
function ensureEmlName(name: string | undefined): string {
  const n = (name ?? '').trim() || 'forwarded-message';
  return /\.eml$/i.test(n) ? n : `${n}.eml`;
}

/**
 * Fetch the RAW MIME of a message via Graph `$value` (Microsoft Learn: "Get message"
 * — `GET /users/{id}/messages/{id}/$value` returns the message as MIME). Used to
 * archive the original `.eml` into the case Box folder + persist it as evidence
 * (box-sync ticket). Returns the bytes; the caller decides whether a failure is fatal.
 */
export async function getMessageRawMime(mailbox: string, messageId: string): Promise<Buffer> {
  const token = await getGraphToken();
  const url =
    `${GRAPH_BASE}/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}/$value`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`graph GET message $value → ${res.status}: ${await safeText(res)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Fetch one attachment's raw bytes via `$value` (item-attachment MIME / large file bytes). */
async function getAttachmentRawValue(
  mailbox: string,
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const token = await getGraphToken();
  const url =
    `${GRAPH_BASE}/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}` +
    `/attachments/${encodeURIComponent(attachmentId)}/$value`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`graph GET attachment $value → ${res.status}: ${await safeText(res)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Fetch a message's internet headers (lower-cased name -> value) — used to detect a REPLY
 * reliably via In-Reply-To / References (ADR-0015 / #3). `internetMessageHeaders` is only
 * returned when explicitly $select'd, so this is a separate, FAILURE-TOLERANT call: any
 * error returns {} so the classifier just falls back to its RE:-subject heuristic and intake
 * is never blocked. Kept off the main getMessageWithAttachments fetch so it cannot regress it.
 */
export async function getMessageHeaders(
  mailbox: string,
  messageId: string,
): Promise<Record<string, string>> {
  try {
    const path =
      `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}` +
      `?$select=internetMessageHeaders`;
    const msg = await graphFetch<{ internetMessageHeaders?: Array<{ name?: string; value?: string }> }>(path);
    const out: Record<string, string> = {};
    for (const h of msg.internetMessageHeaders ?? []) {
      if (h?.name) out[h.name.toLowerCase()] = h.value ?? '';
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * List message ids received at/after a watermark (lifecycle `missed` resync, plan 22 §A.6).
 * Returns ids oldest-first so the watermark can advance monotonically.
 */
export async function listMessageIdsSince(
  mailbox: string,
  watermarkIso: string,
): Promise<{ ids: string[]; newWatermark: string }> {
  const filter = encodeURIComponent(`receivedDateTime ge ${watermarkIso}`);
  const path =
    `/users/${encodeURIComponent(mailbox)}/mailFolders('Inbox')/messages` +
    `?$filter=${filter}&$orderby=receivedDateTime asc&$select=id,receivedDateTime&$top=50`;
  const res = await graphFetch<{ value: Array<{ id: string; receivedDateTime: string }> }>(path);
  const rows = res.value ?? [];
  const newWatermark = rows.length ? rows[rows.length - 1].receivedDateTime : watermarkIso;
  return { ids: rows.map((r) => r.id), newWatermark };
}

/* ---------- helpers ---------- */

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`missing app-setting ${key}`);
  return v;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<no body>';
  }
}
