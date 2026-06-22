/* ============================================================
   Collision Engineers — Code App: LIVE Box transports (deploy-wired).

   The connector-backed implementations of the gated Box transports declared in
   box-transport.ts. Kept SEPARATE (like parser-connector-transport.ts) so the
   default offline build stays SDK-free: this module imports NO
   '@microsoft/power-apps' and NO `src/generated/` service. Instead each factory
   takes the generated service (and the case/gate resolvers) as a STRUCTURAL
   parameter, injected at startup in main.tsx AFTER `pac code add-data-source`
   emits the Box connector + the environment-variable Dataverse services
   (step 14). Until then the seam keeps the `notConnected*` defaults and every Box
   affordance degrades honestly.

   Why injection (not a static import like the parser): the Box custom connector
   and the env-var tables are added at DEPLOY time, so their generated services do
   not exist in the repo yet — a static import would break `tsc`. Injecting the
   structural shape is the same discipline `dataverse-source.ts` uses for
   `GeneratedServices`.

   Transport split (00-BUILD-PLAN reconciliation — direct connector ops, no flow
   in the path for copy/shared-link):
     - copy File Request / shared link -> DIRECT connector ops. The connector op
       names equal the OpenAPI operationIds (`CopyFileRequest`,
       `GetFolderSharedLink`) AND so do their signatures: `CopyFileRequest` takes
       a PATH `fileRequestId` (the TEMPLATE id) + body `{ folder:{id,type}, status }`
       and returns `BoxFileRequest{ url, id, status }`; `GetFolderSharedLink` takes
       a PATH `folderId` + a `shared_link` body and returns
       `BoxSharedLinkItem{ shared_link:{ url } }`. NEITHER takes a `caseId`, and
       NEITHER returns an `outcome`/`fileRequestUrl`/`folderUrl` — there is no flow
       to do that shaping, so the caseId -> {folderId, templateId} RESOLUTION and
       the seam-status (`ok`/`folder_not_ready`/`gated_off`) derivation live HERE,
       in the transport, off injected Dataverse readers + the BoxGates read.
     - finalize -> a DATAVERSE submit-signal WRITE (PATCH the case), consumed by a
       Dataverse-triggered flow. NO flow SAS POST is ever built here.
   ============================================================ */

import type { BoxGates } from './types';
import type {
  CopyFileRequestTransport,
  FileRequestLink,
  FinalizeRequest,
  GetSharedLinkTransport,
  RequestFinalizeTransport,
  SharedFolderLink,
} from './box-transport';

/* ----------  Structural shapes of the generated connector ops  ----------
   The real pac-generated `*Service.<Op>` static methods return
   `{ success, data?, error? }` (the parser precedent). We restate the minimal
   shape so this module needs no SDK import; the generated classes satisfy it.
   The request/response shapes mirror box-connector.json EXACTLY (the generator
   reads that OpenAPI), so the `unknown` bridge in the factory is a type bridge,
   not a shape change. */

interface ConnectorResult<T> {
  success: boolean;
  data?: T;
  error?: { message?: string };
}

/**
 * `CopyFileRequest` connector op — matches box-connector.json verbatim:
 * POST /box/file-requests/{fileRequestId}/copy, path `fileRequestId` (the TEMPLATE
 * id) + body `{ folder:{ id, type }, status? }` -> `BoxFileRequest{ url, id, status,
 * expires_at? }`. The live upload page is `url` (we surface it as `fileRequestUrl`).
 */
export interface CopyFileRequestOp {
  CopyFileRequest(req: {
    fileRequestId: string;
    body: { folder: { id: string; type: 'folder' }; status?: string };
  }): Promise<
    ConnectorResult<{ url?: string; id?: string; status?: string; expires_at?: string }>
  >;
}

/**
 * `GetFolderSharedLink` connector op — matches box-connector.json verbatim:
 * PUT /box/folders/{folderId}/shared-link, path `folderId` + a `shared_link` body
 * -> `BoxSharedLinkItem{ shared_link:{ url } }`. We surface `shared_link.url` as the
 * folder deep link (`folderUrl`); NO embed url is exposed (link, not iframe).
 */
export interface GetFolderSharedLinkOp {
  GetFolderSharedLink(req: {
    folderId: string;
    body: { shared_link: { access: string } };
  }): Promise<ConnectorResult<{ shared_link?: { url?: string } }>>;
}

/**
 * The case lookup the transports need to turn a `caseId` into the Box ids the
 * connector ops actually take. Injected (structural) so this module needs no SDK
 * import and resolves identically to how the flows read `cr1bd_boxfolderid` /
 * `cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID`. `folderId` is null/empty until
 * `box-folder-create` has stamped it (-> `folder_not_ready`, never a null
 * `folder.id` to Box); `templateId` is the operator-set template env-var.
 */
export interface BoxCaseResolver {
  /** The case's `cr1bd_boxfolderid` (empty/undefined until the folder is minted). */
  folderId(caseId: string): Promise<string | undefined>;
  /** The File-Request TEMPLATE id (`cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID` value). */
  templateId(): Promise<string | undefined>;
}

/** The Dataverse Cases update surface used to write the finalize submit-signal. */
export interface CaseSubmitSignalWriter {
  update(
    id: string,
    changes: Record<string, unknown>,
  ): Promise<{ data?: unknown }>;
}

/** The gate read the transports consult before calling Box (defence in depth). */
export type BoxGatesReader = () => Promise<BoxGates>;

/* ----------  Live transport factories  ---------- */

/**
 * Live copy-File-Request transport over the Box connector op `CopyFileRequest`.
 *
 * Does the work the flow used to do (there is no flow in the path now): reads the
 * gate, resolves the case's Box folder id + the template id, then calls the REAL
 * connector op (`fileRequestId` = template, `body.folder.id` = the case folder).
 * Honest seam status throughout: gate off -> `gated_off`; no folder yet (or no
 * template configured) -> `folder_not_ready`; a success with no `url` -> `error`
 * (never a fabricated link).
 */
export function makeConnectorCopyFileRequestTransport(
  svc: CopyFileRequestOp,
  resolver: BoxCaseResolver,
  readGates: BoxGatesReader,
): CopyFileRequestTransport {
  return async (caseId) => {
    // Gate (defence in depth — the Function/connection also gate server-side).
    let gates: BoxGates;
    try {
      gates = await readGates();
    } catch (e) {
      return { status: 'error', message: e instanceof Error ? e.message : String(e) };
    }
    if (!gates.fileRequestEnabled || !gates.fileRequestTemplateConfigured) {
      return { status: 'gated_off', message: 'Image upload links are switched off.' };
    }

    // Resolve the Box ids the op actually takes (folder.id + template id).
    let folderId: string | undefined;
    let templateId: string | undefined;
    try {
      [folderId, templateId] = await Promise.all([
        resolver.folderId(caseId),
        resolver.templateId(),
      ]);
    } catch (e) {
      return { status: 'error', message: e instanceof Error ? e.message : String(e) };
    }
    // Never POST a null folder.id (the load-bearing folder guard); a missing
    // template id is equally not-ready (nothing to copy from).
    if (!folderId || !folderId.trim() || !templateId || !templateId.trim()) {
      return { status: 'folder_not_ready', message: 'The case archive folder isn’t ready yet.' };
    }

    let result: Awaited<ReturnType<CopyFileRequestOp['CopyFileRequest']>>;
    try {
      result = await svc.CopyFileRequest({
        fileRequestId: templateId,
        body: { folder: { id: folderId, type: 'folder' }, status: 'active' },
      });
    } catch (e) {
      return { status: 'error', message: e instanceof Error ? e.message : String(e) };
    }
    if (!result.success) {
      return { status: 'error', message: result.error?.message ?? 'Couldn’t create the upload link.' };
    }
    const url = result.data?.url;
    if (!url) {
      // Honest: a "success" with no URL is not a usable link.
      return { status: 'error', message: 'No upload link was returned.' };
    }
    const data: FileRequestLink = {
      fileRequestUrl: url,
      ...(result.data?.expires_at ? { expiresAt: result.data.expires_at } : {}),
    };
    return { status: 'ok', data };
  };
}

/**
 * Live "Open in Box" shared-link transport over the connector op
 * `GetFolderSharedLink`. Surfaces only the folder deep link
 * (`shared_link.url` -> `folderUrl`) — no embed URL (link, not iframe). Reads the
 * gate, resolves the folder id, then calls the REAL connector op; no folder yet
 * maps to `folder_not_ready` honestly.
 */
export function makeConnectorGetSharedLinkTransport(
  svc: GetFolderSharedLinkOp,
  resolver: BoxCaseResolver,
  readGates: BoxGatesReader,
): GetSharedLinkTransport {
  return async (caseId) => {
    let gates: BoxGates;
    try {
      gates = await readGates();
    } catch (e) {
      return { status: 'error', message: e instanceof Error ? e.message : String(e) };
    }
    if (!gates.apiEnabled) {
      return { status: 'gated_off', message: 'The archive isn’t switched on.' };
    }

    let folderId: string | undefined;
    try {
      folderId = await resolver.folderId(caseId);
    } catch (e) {
      return { status: 'error', message: e instanceof Error ? e.message : String(e) };
    }
    if (!folderId || !folderId.trim()) {
      return { status: 'folder_not_ready', message: 'The case archive folder isn’t ready yet.' };
    }

    let result: Awaited<ReturnType<GetFolderSharedLinkOp['GetFolderSharedLink']>>;
    try {
      result = await svc.GetFolderSharedLink({
        folderId,
        body: { shared_link: { access: 'open' } },
      });
    } catch (e) {
      return { status: 'error', message: e instanceof Error ? e.message : String(e) };
    }
    if (!result.success) {
      return { status: 'error', message: result.error?.message ?? 'Couldn’t open the archive.' };
    }
    const url = result.data?.shared_link?.url;
    if (!url) return { status: 'error', message: 'No archive link was returned.' };
    const data: SharedFolderLink = { folderUrl: url };
    return { status: 'ok', data };
  };
}

/**
 * Live finalize transport — writes the submit-signal to Dataverse (NOT a flow
 * POST). PATCHes the case with the submit-requested FLAG + the requested
 * byte-identical payload hash + the staged 12-field EVA JSON; a
 * Dataverse-triggered flow (`finalize-eva-box`, "When a row is modified" on the
 * submit-requested flag) reads all three off the row, submits, and stamps the
 * terminal status. We return `accepted` only — the UI re-reads the flow-stamped
 * status afterwards (never invents `box_synced` locally).
 *
 * Why all THREE columns (not just the flag): a Dataverse row-update trigger
 * exposes only the row, never an HTTP body, so the payload + its hash must ride
 * ON the row for the flow to read them. The requested-hash column is kept
 * DISTINCT from the finalize latch (`cr1bd_finalizedpayloadhash`, stamped LAST by
 * the flow) so writing the request never pre-empts the flow's stamped-LAST
 * resume-safety. The column names are the submit-signal contract owned by the
 * dataverse section; passed in so this module hard-codes no schema name it can't
 * verify offline.
 */
export function makeDataverseFinalizeTransport(
  cases: CaseSubmitSignalWriter,
  columns: {
    submitRequestedColumn: string;
    payloadHashColumn: string;
    evaPayloadColumn: string;
  },
): RequestFinalizeTransport {
  return async (req: FinalizeRequest) => {
    try {
      await cases.update(req.caseId, {
        [columns.submitRequestedColumn]: true,
        [columns.payloadHashColumn]: req.payloadHash,
        [columns.evaPayloadColumn]: req.evaPayload12,
      });
      // Accepted = signal written. Status stays flow-driven; UI re-reads the case.
      return { status: 'ok', data: { accepted: true } };
    } catch (e) {
      return { status: 'error', message: e instanceof Error ? e.message : String(e) };
    }
  };
}
