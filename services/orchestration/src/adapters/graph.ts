/** *
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
 * Optional: GRAPH_IMAGE_FLOOR_DISABLED (TKT-047 kill switch — see skipAsSignatureImage below).
 */

// Intra-package import only (still zero external npm deps, per "Dependency-free" above) —
// TKT-047's signature/logo-image raster floor (rules-engine-v2 Phase 2 "Signature filter").
import { assessSignatureImage } from '../platform/image-sniff.js';
import { safeErrorText } from '@cs/server-runtime';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const MAX_ATTACHMENT_PAGES = 100;
const MAX_MESSAGE_SEARCH_PAGES = 100;
const MAX_MESSAGE_SEARCH_RESULTS = 1_000;
// TKT-219: 250 per page (was 25) — a `$search` yields up to 1,000 SENT-date-sorted results
// and the retro original is by definition OLD mail, so a small page + small caller total
// meant the oldest hits were never fetched. Callers still bound the TOTAL via `top`.
const MESSAGE_SEARCH_PAGE_SIZE = 250;

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
    throw new Error(`graph token endpoint ${res.status}: ${await safeErrorText(res)}`);
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
    throw new Error(`graph ${init.method ?? 'GET'} ${path} → ${res.status}: ${await safeErrorText(res)}`);
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
  /** Authoritative browser target returned by Microsoft Graph. */
  webLink?: string;
  internetMessageId?: string;
  subject?: string;
  receivedDateTime?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  hasAttachments?: boolean;
  /** In Graph's default property set — no $select needed. Capture-only for now; the
   *  column lands with Phase 2's DDL (local thread correlation). */
  conversationId?: string;
}

export interface FetchedMessage {
  message: GraphMessage;
  attachments: GraphAttachment[];
  attachmentFailures: Array<{
    id: string;
    name: string;
    contentType: string;
    reason: string;
  }>;
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
    // Ask Graph to return a message id that survives ordinary same-mailbox folder
    // moves, while retaining the plain-text body representation intake expects.
    headers: { Prefer: 'outlook.body-content-type="text", IdType="ImmutableId"' },
  });
  if (!message || typeof message !== 'object') {
    throw new Error('graph message response was null');
  }
  const attachments: GraphAttachment[] = [];
  const attachmentFailures: FetchedMessage['attachmentFailures'] = [];
  if (message.hasAttachments) {
    let pagePath: string | null = `${base}/attachments`;
    const seenPages = new Set<string>();
    let pageCount = 0;
    while (pagePath) {
      const pageKey = pagePath.startsWith('http') ? pagePath : `${GRAPH_BASE}${pagePath}`;
      if (seenPages.has(pageKey)) {
        throw new Error(`graph attachment pagination cycle at ${pagePath}`);
      }
      if (pageCount >= MAX_ATTACHMENT_PAGES) {
        throw new Error(`graph attachment pagination exceeded ${MAX_ATTACHMENT_PAGES} pages`);
      }
      seenPages.add(pageKey);
      pageCount++;

      // A failed later page must reject the whole fetch. Treating the pages already
      // seen as complete would make the caller report success while silently omitting
      // every attachment on the unavailable page.
      const list: {
        value?: GraphAttachment[];
        '@odata.nextLink'?: string;
      } = await graphFetch(pagePath);
      if (!list || !Array.isArray(list.value)) {
        throw new Error(`graph attachment pagination response was null at ${pagePath}`);
      }
      for (const a of list.value) {
        if (a.isInline === true) continue;
        if (!(a.id ?? '').trim()) {
          attachmentFailures.push({
            id: '',
            name: a.name ?? '',
            contentType: a.contentType ?? 'application/octet-stream',
            reason: 'attachment identity missing',
          });
          continue;
        }
        const otype = (a['@odata.type'] ?? '').toLowerCase();
        if (typeof a.contentBytes === 'string') {
          // A normal fileAttachment with inline base64 bytes — the common case.
          // TKT-047: the isInline check above only catches signature/logo images when the
          // sender's client flagged them inline — many arrive as ordinary attachments instead,
          // so sniff + drop those too before they land in the evidence set.
          if (skipAsSignatureImage(a.name, a.contentType, Buffer.from(a.contentBytes, 'base64'))) {
            continue;
          }
          attachments.push(a);
          continue;
        }
        // No contentBytes: either an ITEM attachment (a forwarded message — the
        // instruction often arrives this way and was previously DROPPED, so the
        // parser saw nothing → the "only registration" symptom) or a large
        // fileAttachment whose bytes Graph omitted. Both are fetchable via `$value`.
        // Best-effort: a fetch failure records that attachment and continues its siblings.
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
            // TKT-047: same signature/logo sniff as the inline-bytes branch above.
            if (skipAsSignatureImage(a.name, a.contentType, raw)) continue;
            attachments.push({ ...a, size: raw.length, contentBytes: raw.toString('base64') });
          }
        } catch (e) {
          attachmentFailures.push({
            id: a.id,
            name: a.name ?? '',
            contentType: a.contentType ?? 'application/octet-stream',
            reason: (e instanceof Error ? e.message : String(e)).slice(0, 300),
          });
        }
      }
      pagePath = list['@odata.nextLink']?.trim() || null;
    }
  }
  return { message, attachments, attachmentFailures };
}

/** Append `.eml` to an item-attachment name (forwarded items often have no extension). */
function ensureEmlName(name: string | undefined): string {
  const n = (name ?? '').trim() || 'forwarded-message';
  return /\.eml$/i.test(n) ? n : `${n}.eml`;
}

/**
 * TKT-047 / rules-engine-v2 Phase 2 "Signature filter": Outlook's `isInline` flag (checked
 * above) only catches the sender clients that flag embedded signature/logo images correctly —
 * many arrive as ordinary non-inline attachments and would otherwise be archived to Box as if
 * they were case evidence. Delegates the actual decision to `assessSignatureImage`
 * (image-sniff.ts), which mirrors the vendored cedocumentmapper engine's decorative-raster
 * filter (`_MIN_EXTRACTED_IMAGE_AREA` / `is_decorative_raster` in
 * services/functions/parser/cedocumentmapper_v2/application/service.py): conservative content-based
 * checks plus a byte-size fallback for images Graph's bytes-only payload can't be
 * dimension-sniffed from (see that module for the current decision rules and recall guards).
 *
 * Logs the filename + why (dimensions vs byte-size) on every skip — a filtered attachment must
 * stay observable in App Insights traces, never a silent gap in the evidence set.
 * `GRAPH_IMAGE_FLOOR_DISABLED=true` is the kill switch (default off ⇒ filter active); read
 * directly off `process.env` rather than via `@cs/domain/gates` because this file is
 * deliberately kept free of the domain package (see the file header's "Dependency-free").
 */
function skipAsSignatureImage(name: string, contentType: string | undefined, bytes: Buffer): boolean {
  if (process.env.GRAPH_IMAGE_FLOOR_DISABLED === 'true') return false;
  const verdict = assessSignatureImage(name, contentType, bytes);
  if (!verdict.flagged) return false;
  // Keep the trace independent of the classifier's evolving reason union. Dimensions
  // remain the useful diagnostic for every geometry-based rule; the byte count covers
  // rules that act when dimensions cannot be recovered.
  const reason = verdict.dims
    ? `dimensions ${verdict.dims.width}x${verdict.dims.height}`
    : `byte-size ${bytes.length}b`;
  console.log(`[graph] skipped attachment "${name}" — likely signature/logo image (${reason})`);
  return true;
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
    throw new Error(`graph GET message $value → ${res.status}: ${await safeErrorText(res)}`);
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
    throw new Error(`graph GET attachment $value → ${res.status}: ${await safeErrorText(res)}`);
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
      if (!h?.name) continue;
      const name = h.name.toLowerCase();
      // Keep the outermost (recipient-nearest) occurrence. In particular, an
      // attacker-supplied inner Authentication-Results header must never replace
      // the result stamped by Exchange at receipt.
      if (!(name in out)) out[name] = h.value ?? '';
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

/* ---------- Replay backfill pager (TKT-059 / GO_LIVE_SPRINT_PLAN P1) ---------- */

/**
 * Resolve the Inbox folder id + every descendant folder id for a mailbox.
 *
 * The replay pager lists the WHOLE mailbox (`/users/{mbx}/messages`) — which per
 * Microsoft Learn (user-list-messages) also returns Deleted Items, Junk, Sent Items and
 * Drafts — then keeps only messages whose `parentFolderId` is in the Inbox subtree. That
 * mirrors the live intake (which only ever processed Inbox arrivals) while still capturing
 * staff-FILED mail: with `OUTLOOK_MOVE_ENABLED` on, staff move intake mail into Inbox
 * CHILD folders, so an Inbox-only scope would miss them.
 */
export async function resolveInboxSubtreeFolderIds(mailbox: string): Promise<Set<string>> {
  const u = encodeURIComponent(mailbox);
  const inbox = await graphFetch<{ id: string }>(`/users/${u}/mailFolders/Inbox?$select=id`);
  const ids = new Set<string>([inbox.id]);
  const queue: string[] = [inbox.id];
  while (queue.length) {
    const parent = queue.shift() as string;
    let path: string | null =
      `/users/${u}/mailFolders/${encodeURIComponent(parent)}/childFolders?$select=id&$top=100`;
    while (path) {
      const page: { value?: Array<{ id: string }>; '@odata.nextLink'?: string } =
        await graphFetch(path);
      for (const f of page.value ?? []) {
        if (!ids.has(f.id)) {
          ids.add(f.id);
          queue.push(f.id);
        }
      }
      path = page['@odata.nextLink'] ?? null;
    }
  }
  return ids;
}

/* (The replay-backfill windowed pager `listMessagesSince` + its `ReplayPageItem`
   projection were REMOVED with the non-viable replay driver — TKT-106. The finding
   that motivated the removal is preserved in TKT-059's verification record.) */

/* ---------- Retro reconstruction mailbox search (ADR-0022 R3) ---------- */

/** KQL free-text phrase for a Graph messages `$search` clause: strip the two
 *  characters the clause syntax reserves (double quote + backslash), wrap in the
 *  REQUIRED double quotes. The caller URL-encodes the whole clause. */
export function kqlPhrase(value: string): string {
  const cleaned = String(value ?? '').replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();
  return `"${cleaned}"`;
}

/**
 * Full-text `$search` over one mailbox's messages (ADR-0022 R3 — find the archived
 * original instruction for a retro reconstruction).
 *
 * Semantics VERIFIED against Microsoft Learn (graph/search-query-parameter +
 * graph/known-issues, checked 2026-07-04 — the anti-churn doctrine):
 *  - messages `$search` without a property targets **from, subject, body**; KQL
 *    property syntax (subject:/body:/attachment:) is supported inside the quotes;
 *  - results come back sorted by SENT date-time; up to 1,000 results exist and
 *    `$top` page-sizes them. This helper follows `@odata.nextLink` with cycle,
 *    page-count and caller-supplied total-result bounds;
 *  - the whole clause MUST be double-quoted ({@link kqlPhrase});
 *  - do NOT combine `$search` with `$filter`/`$orderby` on messages — unsupported
 *    parameter combos "might fail silently" (known-issues §9);
 *  - `ConsistencyLevel: eventual` is a DIRECTORY-object requirement, not needed here;
 *  - `/users/{mbx}/messages` spans the mailbox's mail folders (Sent Items included —
 *    callers must drop own-mailbox senders), the same surface
 *    {@link findMessageByInternetMessageId} uses. Rides the existing Exchange-RBAC
 *    `Mail.Read` scope on the three intake mailboxes — no new grant.
 */
export async function searchMessages(
  mailbox: string,
  phrase: string,
  top = 25,
  /** TKT-219 "no silent caps": called when the total-result bound cut the sweep short
   *  while Graph still offered a nextLink (an older original may exist beyond the cap). */
  onTruncated?: (message: string) => void,
): Promise<
  Array<{
    id: string;
    subject: string;
    receivedDateTime: string;
    from: string;
    hasAttachments: boolean;
  }>
> {
  const totalLimit = Math.min(
    MAX_MESSAGE_SEARCH_RESULTS,
    Math.max(1, Number.isFinite(top) ? Math.trunc(top) : MESSAGE_SEARCH_PAGE_SIZE),
  );
  let path: string | null =
    `/users/${encodeURIComponent(mailbox)}/messages` +
    `?$search=${encodeURIComponent(phrase)}` +
    `&$select=id,subject,receivedDateTime,from,hasAttachments` +
    `&$top=${Math.min(MESSAGE_SEARCH_PAGE_SIZE, totalLimit)}`;
  const seenPages = new Set<string>();
  const found: Array<{
    id: string;
    subject: string;
    receivedDateTime: string;
    from: string;
    hasAttachments: boolean;
  }> = [];
  let pageCount = 0;

  while (path && found.length < totalLimit) {
    const pageKey = path.startsWith('http') ? path : `${GRAPH_BASE}${path}`;
    if (seenPages.has(pageKey)) {
      throw new Error(`graph message search pagination cycle at ${path}`);
    }
    if (pageCount >= MAX_MESSAGE_SEARCH_PAGES) {
      throw new Error(`graph message search pagination exceeded ${MAX_MESSAGE_SEARCH_PAGES} pages`);
    }
    seenPages.add(pageKey);
    pageCount++;

    const page: {
      value?: Array<{
        id: string;
        subject?: string;
        receivedDateTime?: string;
        from?: { emailAddress?: { address?: string } };
        hasAttachments?: boolean;
      }>;
      '@odata.nextLink'?: string;
    } = await graphFetch(path);
    if (!page || !Array.isArray(page.value)) {
      throw new Error(`graph message search pagination response was null at ${path}`);
    }
    for (const m of page.value) {
      if (found.length >= totalLimit) break;
      found.push({
        id: m.id,
        subject: m.subject ?? '',
        receivedDateTime: m.receivedDateTime ?? '',
        from: (m.from?.emailAddress?.address ?? '').toLowerCase(),
        hasAttachments: m.hasAttachments === true,
      });
    }
    path = page['@odata.nextLink']?.trim() || null;
  }
  if (path && found.length >= totalLimit) {
    onTruncated?.(
      `graph message search truncated at ${totalLimit} results (${pageCount} page(s)) for ${mailbox} — older matches may exist beyond the cap`,
    );
  }
  return found;
}

/**
 * TKT-222 — minimal identity fetch for a `$search` hit: `$search` responses carry the Graph
 * id but NOT the RFC Internet-Message-Id the triage table is keyed on. One cheap `$select`
 * read per candidate; returns null on a vanished message (404) rather than throwing.
 */
export async function getMessageIdentity(
  mailbox: string,
  messageId: string,
): Promise<{ internetMessageId: string; subject: string; from: string; receivedDateTime: string } | null> {
  try {
    const m = await graphFetch<{
      internetMessageId?: string;
      subject?: string;
      from?: { emailAddress?: { address?: string } };
      receivedDateTime?: string;
    }>(
      `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}` +
        `?$select=internetMessageId,subject,from,receivedDateTime`,
    );
    if (!m?.internetMessageId) return null;
    return {
      internetMessageId: m.internetMessageId,
      subject: m.subject ?? '',
      from: (m.from?.emailAddress?.address ?? '').toLowerCase(),
      receivedDateTime: m.receivedDateTime ?? '',
    };
  } catch (e) {
    if (String(e).includes('404')) return null;
    throw e;
  }
}

/* ---------- Outlook filing (TKT-054 / 020726 E6 — gated by OUTLOOK_MOVE_ENABLED) ---------- */

/** Escape a value for a Graph OData $filter string literal (single quotes double up). */
export function odataQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Resolve the CURRENT Graph message id from the RFC Internet-Message-Id. The stored
 * dedup key is the internetMessageId (not the Graph id), and a Graph id changes when a
 * message moves folder — so the mover always re-resolves. Searches the whole mailbox
 * (not just Inbox) so a retry after a partial move still finds the message. Returns
 * null when no match (deleted / different mailbox).
 */
export async function findMessageByInternetMessageId(
  mailbox: string,
  internetMessageId: string,
): Promise<{ id: string; parentFolderId: string } | null> {
  const filter = encodeURIComponent(`internetMessageId eq ${odataQuote(internetMessageId)}`);
  const path =
    `/users/${encodeURIComponent(mailbox)}/messages` +
    `?$filter=${filter}&$select=id,parentFolderId&$top=2`;
  const res = await graphFetch<{ value: Array<{ id: string; parentFolderId: string }> }>(path);
  return res.value?.[0] ?? null;
}

/**
 * Walk (and create as needed) a child-folder chain under the well-known Inbox:
 * segments ['Queries','Case queries'] -> Inbox/Queries/Case queries. Returns the
 * final folder id. Folder create needs Mail.ReadWrite (the same Exchange-RBAC
 * re-consent the whole move path depends on; see docs/operations/operator-actions.md).
 */
export async function ensureInboxChildFolder(mailbox: string, segments: string[]): Promise<string> {
  const user = encodeURIComponent(mailbox);
  let parentId = 'inbox'; // the well-known folder name is valid in the id segment
  for (const name of segments) {
    const filter = encodeURIComponent(`displayName eq ${odataQuote(name)}`);
    const found = await graphFetch<{ value: Array<{ id: string }> }>(
      `/users/${user}/mailFolders/${encodeURIComponent(parentId)}/childFolders?$filter=${filter}&$select=id&$top=1`,
    );
    if (found.value?.[0]) {
      parentId = found.value[0].id;
      continue;
    }
    const created = await graphFetch<{ id: string }>(
      `/users/${user}/mailFolders/${encodeURIComponent(parentId)}/childFolders`,
      { method: 'POST', body: JSON.stringify({ displayName: name }) },
    );
    parentId = created.id;
  }
  return parentId;
}

/** Move a message to a destination folder (Mail.ReadWrite). Returns the new message id. */
export async function moveMessage(
  mailbox: string,
  messageId: string,
  destinationFolderId: string,
): Promise<string> {
  const res = await graphFetch<{ id: string }>(
    `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}/move`,
    { method: 'POST', body: JSON.stringify({ destinationId: destinationFolderId }) },
  );
  return res.id;
}

/* ---------- helpers ---------- */

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`missing app-setting ${key}`);
  return v;
}
