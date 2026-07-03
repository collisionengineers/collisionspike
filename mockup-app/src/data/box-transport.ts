/* ============================================================
   Collision Engineers — SWA-hosted SPA: Box transports (GATED, injectable).

   The SPA (`cespk-spa-dev`) fetches the Data API origin directly (CORS-allowed
   under the SWA's CSP) — see `box-rest-transport.ts` for the live REST
   transports wired at startup in `main.tsx`. This module is the transport
   SEAM for the Box affordances, in the gated-transport shape of
   `enrichment-client.ts`:

     - copyFileRequest     -> POST /api/cases/{id}/box/copy-file-request (the chaser link)
     - getSharedLink       -> GET  /api/cases/{id}/box/shared-link           ("Open in Box")
     - requestFinalize     -> POST /api/cases/{id}/box/finalize (a Data API / Postgres write)

   Contract preserved:
     * copy response is `{ fileRequestUrl, expiresAt, outcome }` (the app binds to
       `fileRequestUrl`, never `uploadUrl`), `outcome ∈ sent|gated_off|folder_not_ready`.
     * Evidence is a server-minted "Open in Box" DEEP LINK only — no iframe, no
       frame-src edit; the shared-link transport surfaces a `folderUrl` and
       deliberately exposes no embed URL.

   Each transport is INJECTABLE. The default is an honest `not_connected` (the
   transport is unbound / the gate is off) — the UI shows the message, never a
   fabricated link. The live transports bind the REST implementations at
   startup (kept out of this module so the offline build stays fetch-free; they
   live in `box-rest-transport.ts`).
   ============================================================ */

import type { CaseStatus } from '@cs/domain';

/* ----------  Shared status vocabulary  ---------- */

/**
 * The outcome of a Box transport call. `not_connected` = the REST transport
 * is unbound (not yet configured in `main.tsx`); `folder_not_ready` = the case
 * has no Box folder yet (Postgres `box_folder_id` null — never call Box with a
 * null `folder.id`); `gated_off` = the BOX_* gate is false server-side;
 * `error` = a live failure.
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
 * "Open in Box" deep link (opened in a new tab — an external navigation, not a
 * `fetch` call). NO embed URL is exposed: evidence is always linked, never
 * embedded — no iframe, no `frame-src` edit.
 */
export interface SharedFolderLink {
  folderUrl: string;
}

/** Mint/read the case folder's shared link (gated, by caseId). */
export type GetSharedLinkTransport = (
  caseId: string,
) => Promise<BoxResult<SharedFolderLink>>;

/* ----------  finalize -> POST /api/cases/{id}/box/finalize (a Data API write)  ---------- */

/** The submit-signal the SPA writes; the Data API validates + persists it. */
export interface FinalizeRequest {
  caseId: string;
  /** The byte-identical payload hash (built by the shared eva-export serializer). */
  payloadHash: string;
  /** The 12-field EVA JSON string (the same serializer the API validates). */
  evaPayload12: string;
}

/**
 * The result of REQUESTING finalize. `accepted` means the submit-signal was
 * written — NOT that archival finished. Direct submit is currently an honest
 * `gated_off` (EVA submission is the JSON drag-drop path today — see
 * "Export for EVA"); the UI awaits then re-reads the case rather than
 * inventing a terminal status locally.
 */
export interface FinalizeAck {
  accepted: boolean;
  /** The case status as last read (may still be pre-terminal; re-read after). */
  status?: CaseStatus;
}

/** Write the finalize submit-signal (gated; currently honest gated_off). */
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
   The live REST transports (box-rest-transport.ts) are bound at startup in
   main.tsx via configureBoxTransports(). Screens read the ACTIVE transport via
   the getters below; until configured, every one is the honest `not_connected`
   default, so the offline build + an unbound transport both degrade honestly.
   This mirrors the `configureDataAccess` selector in index.ts. */

let activeCopyFileRequest: CopyFileRequestTransport = notConnectedCopyFileRequestTransport;
let activeGetSharedLink: GetSharedLinkTransport = notConnectedGetSharedLinkTransport;
let activeRequestFinalize: RequestFinalizeTransport = notConnectedRequestFinalizeTransport;

/** Bind the live Box transports at startup (main.tsx). */
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
