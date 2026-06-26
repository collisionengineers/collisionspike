/* ============================================================
   Collision Engineers — Code App: Box transports (CSP-safe, GATED).

   The deployed Code App runs under CSP `connect-src 'none'`, so NO `fetch()` to
   Box ever works — every Box call goes through the Power Apps connector layer
   same-origin (the proven `parser-connector-transport.ts` precedent), or through
   a Dataverse write. This module is the seam for the Wave-4 Box affordances, in
   the gated-transport shape of `enrichment-client.ts`:

     - copyFileRequest     -> DIRECT connector op `CopyFileRequest`  (the chaser link)
     - getSharedLink       -> DIRECT connector op `GetFolderSharedLink`    ("Open in Box")
     - requestFinalize     -> a DATAVERSE submit-signal WRITE (NOT a SAS flow POST)

   Reconciliations honoured (00-BUILD-PLAN.md table):
     * Code App invokes copy/shared-link via DIRECT connector ops (no flow in the
       path); finalize is a Dataverse submit-signal the app PATCHes, consumed by a
       Dataverse-triggered flow — the app NEVER POSTs to a flow SAS URL.
     * copy response is `{ fileRequestUrl, expiresAt, outcome }` (the app binds to
       `fileRequestUrl`, never `uploadUrl`), `outcome ∈ sent|gated_off|folder_not_ready`.
     * Evidence is a server-minted "Open in Box" DEEP LINK only — no iframe, no
       BOX_EMBED path, no frame-src; so the shared-link transport surfaces a
       `folderUrl` and deliberately exposes no embed URL.

   Each transport is INJECTABLE. The default is an honest `not_connected` (the
   connection is unbound / the gate is off) — the UI shows the message, never a
   fabricated link. The live transports bind the generated connector services at
   deploy time (kept out of this module so the offline build stays SDK-free; they
   live in box-connector-transport.ts alongside parser-connector-transport.ts).
   ============================================================ */

import type { CaseStatus } from '@cs/domain';

/* ----------  Shared status vocabulary  ---------- */

/**
 * The outcome of a Box transport call. `not_connected` = the connector/connection
 * is unbound (operator hasn't wired it); `folder_not_ready` = the case has no Box
 * folder yet (`cr1bd_boxfolderid` null — never call Box with a null `folder.id`);
 * `gated_off` = the BOX_* gate is false server-side; `error` = a live failure.
 */
export type BoxTransportStatus =
  | 'ok'
  | 'not_connected'
  | 'folder_not_ready'
  | 'gated_off'
  | 'error';

export interface BoxResult<T> {
  status: BoxTransportStatus;
  data?: T;
  /** Operator-facing reason when not ok. */
  message?: string;
}

/* ----------  copy File Request -> upload link (the chaser action)  ---------- */

/**
 * The live upload link a copied File Request returns. `fileRequestUrl` is the
 * account-free public upload page; `expiresAt` is set only when the template/copy
 * carried an expiry. The reg-capture form is baked into the template (cannot be
 * varied by the copy), so nothing else is needed here.
 */
export interface FileRequestLink {
  fileRequestUrl: string;
  expiresAt?: string;
}

/** Copy the per-case File Request and return its upload link (gated, by caseId). */
export type CopyFileRequestTransport = (
  caseId: string,
) => Promise<BoxResult<FileRequestLink>>;

/* ----------  shared link -> "Open in Box" deep link (evidence viewing)  ---------- */

/**
 * A server-minted shared link for the case's Box folder. `folderUrl` is the
 * "Open in Box" deep link (opened in a new tab — an external navigation, NOT a
 * `fetch`, so `connect-src 'none'` is irrelevant). NO embed URL is exposed: the
 * operator decision is LINK, not iframe (`BOX_EMBED_ENABLED` stays reserved/off).
 */
export interface SharedFolderLink {
  folderUrl: string;
}

/** Mint/read the case folder's shared link (gated, by caseId). */
export type GetSharedLinkTransport = (
  caseId: string,
) => Promise<BoxResult<SharedFolderLink>>;

/* ----------  finalize -> Dataverse submit-signal (NOT a flow POST)  ---------- */

/** The submit-signal the app writes; the Dataverse-triggered flow consumes it. */
export interface FinalizeRequest {
  caseId: string;
  /** The byte-identical payload hash (built by the shared eva-export serializer). */
  payloadHash: string;
  /** The 12-field EVA JSON string (the same serializer the flow validates). */
  evaPayload12: string;
}

/**
 * The result of REQUESTING finalize. `accepted` means the submit-signal was
 * written — NOT that archival finished. The status transition
 * (`… -> box_synced`) is STRICTLY flow-driven (the flow stamps
 * `cr1bd_status=100000009` LAST); the UI awaits then re-reads the case. We
 * therefore return the case's CURRENT status, never a locally-invented terminal.
 */
export interface FinalizeAck {
  accepted: boolean;
  /** The case status as last read (may still be pre-terminal; re-read after). */
  status?: CaseStatus;
}

/** Write the submit-signal that triggers `finalize-eva-box` (gated). */
export type RequestFinalizeTransport = (
  req: FinalizeRequest,
) => Promise<BoxResult<FinalizeAck>>;

/* ----------  Default (not-connected) transports  ----------
   Honest "not available yet" until the operator binds the connection / writes are
   enabled. The UI renders the message and NEVER fabricates a link or a terminal. */

const NOT_CONNECTED_FILE_REQUEST =
  'Image upload link isn’t available yet.';
const NOT_CONNECTED_SHARED_LINK = 'Open in Archive isn’t available yet.';
const NOT_CONNECTED_FINALIZE = 'Direct submit isn’t available yet.';

export const notConnectedCopyFileRequestTransport: CopyFileRequestTransport = async () => ({
  status: 'not_connected',
  message: NOT_CONNECTED_FILE_REQUEST,
});

export const notConnectedGetSharedLinkTransport: GetSharedLinkTransport = async () => ({
  status: 'not_connected',
  message: NOT_CONNECTED_SHARED_LINK,
});

export const notConnectedRequestFinalizeTransport: RequestFinalizeTransport = async () => ({
  status: 'not_connected',
  message: NOT_CONNECTED_FINALIZE,
});

/* ----------  Public functions (input-guarded, transport-delegating)  ----------
   Mirror enrichment-client.ts: validate the trivial input, then delegate. The
   default transport keeps every call honest off when nothing is wired. */

/** Get the per-case File-Request upload link (gated; honest not_connected). */
export async function copyFileRequest(
  caseId: string,
  transport: CopyFileRequestTransport = notConnectedCopyFileRequestTransport,
): Promise<BoxResult<FileRequestLink>> {
  const id = caseId.trim();
  if (!id) return { status: 'error', message: 'No case selected.' };
  return transport(id);
}

/** Get the case folder's "Open in Box" deep link (gated; honest not_connected). */
export async function getSharedLink(
  caseId: string,
  transport: GetSharedLinkTransport = notConnectedGetSharedLinkTransport,
): Promise<BoxResult<SharedFolderLink>> {
  const id = caseId.trim();
  if (!id) return { status: 'error', message: 'No case selected.' };
  return transport(id);
}

/** Write the finalize submit-signal (gated; honest not_connected). */
export async function requestFinalize(
  req: FinalizeRequest,
  transport: RequestFinalizeTransport = notConnectedRequestFinalizeTransport,
): Promise<BoxResult<FinalizeAck>> {
  if (!req.caseId.trim()) return { status: 'error', message: 'No case selected.' };
  return transport(req);
}

/* ----------  Deploy-wired transport registry  ----------
   The live connector/Dataverse transports are bound at startup in main.tsx AFTER
   `pac code add-data-source` (they cannot be statically imported — the generated
   services don't exist in the repo). Screens read the ACTIVE transport via the
   getters below; until configured, every one is the honest `not_connected`
   default, so the offline build + an unbound connection both degrade honestly.
   This mirrors the `configureDataAccess` selector in index.ts. */

let activeCopyFileRequest: CopyFileRequestTransport = notConnectedCopyFileRequestTransport;
let activeGetSharedLink: GetSharedLinkTransport = notConnectedGetSharedLinkTransport;
let activeRequestFinalize: RequestFinalizeTransport = notConnectedRequestFinalizeTransport;

/** Bind the live Box transports at startup (main.tsx, post add-data-source). */
export function configureBoxTransports(transports: {
  copyFileRequest?: CopyFileRequestTransport;
  getSharedLink?: GetSharedLinkTransport;
  requestFinalize?: RequestFinalizeTransport;
}): void {
  if (transports.copyFileRequest) activeCopyFileRequest = transports.copyFileRequest;
  if (transports.getSharedLink) activeGetSharedLink = transports.getSharedLink;
  if (transports.requestFinalize) activeRequestFinalize = transports.requestFinalize;
}

/** Reset to the not-connected defaults (tests). */
export function resetBoxTransports(): void {
  activeCopyFileRequest = notConnectedCopyFileRequestTransport;
  activeGetSharedLink = notConnectedGetSharedLinkTransport;
  activeRequestFinalize = notConnectedRequestFinalizeTransport;
}

/** The active copy-File-Request transport (live if configured, else not_connected). */
export const activeCopyFileRequestTransport: CopyFileRequestTransport = (caseId) =>
  activeCopyFileRequest(caseId);
/** The active shared-link transport. */
export const activeGetSharedLinkTransport: GetSharedLinkTransport = (caseId) =>
  activeGetSharedLink(caseId);
/** The active finalize submit-signal transport. */
export const activeRequestFinalizeTransport: RequestFinalizeTransport = (req) =>
  activeRequestFinalize(req);
