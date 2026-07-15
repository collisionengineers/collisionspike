/* ============================================================
   Collision Engineers — REST Box transports (plan 30 §3).

   Replaces `box-connector-transport.ts`. Off Power Platform the SPA
   legitimately fetch-es the API origin (CORS-allowed), so the live
   transports are straight fetch calls carrying the Bearer token.

   The seam-status contract is preserved exactly:
     ok / gated_off / folder_not_ready / error / not_connected
   The gate-check and folder-readiness decisions move INTO the API
   (it reads the app-settings gates + the case's box_folder_id column),
   so the client just GETs/POSTs and maps the API's JSON status back
   onto the existing BoxResult union.  No `cr1bd_*` columns on the
   client; no connector ops.

   The Box affordance functions (`copyFileRequest`, `getSharedLink`,
   `requestFinalize`) remain in `box-transport.ts` (pure, unchanged).
   These transports implement the injectable transport contracts those
   functions delegate to.

   HTTP mapping:
     copyFileRequest  → POST /api/cases/{id}/box/copy-file-request
     getSharedLink    → GET  /api/cases/{id}/box/shared-link
     requestFinalize  → POST /api/cases/{id}/box/finalize
   ============================================================ */

import type {
  BoxResult,
  FileRequestLink,
  SharedFolderLink,
  FinalizeRequest,
  FinalizeAck,
  CopyFileRequestTransport,
  GetSharedLinkTransport,
  RequestFinalizeTransport,
} from './box-transport';
import type { ApiCall } from './rest-client';

/** Wire response from the API — matches the seam BoxResult shape. */
interface ApiBoxResult<T> {
  status: 'ok' | 'gated_off' | 'folder_not_ready' | 'error';
  data?: T;
  message?: string;
}

/**
 * Build the live REST copy-file-request transport.
 * POST /api/cases/{id}/box/copy-file-request → BoxResult<FileRequestLink>
 */
export function makeRestCopyFileRequestTransport(call: ApiCall): CopyFileRequestTransport {
  return async (caseId: string): Promise<BoxResult<FileRequestLink>> => {
    try {
      const res = await call<ApiBoxResult<FileRequestLink>>(
        'POST',
        `/api/cases/${encodeURIComponent(caseId)}/box/copy-file-request`,
      );
      return res;
    } catch (e) {
      return { status: 'error', message: (e as Error).message };
    }
  };
}

/**
 * Build the live REST shared-link transport.
 * GET /api/cases/{id}/box/shared-link → BoxResult<SharedFolderLink>
 */
export function makeRestGetSharedLinkTransport(call: ApiCall): GetSharedLinkTransport {
  return async (caseId: string): Promise<BoxResult<SharedFolderLink>> => {
    try {
      const res = await call<ApiBoxResult<SharedFolderLink>>(
        'GET',
        `/api/cases/${encodeURIComponent(caseId)}/box/shared-link`,
      );
      return res;
    } catch (e) {
      return { status: 'error', message: (e as Error).message };
    }
  };
}

/**
 * Build the live REST finalize transport.
 * POST /api/cases/{id}/box/finalize → BoxResult<FinalizeAck>
 *
 * The API accepts `{ payloadHash, evaPayload12 }` in the body and writes
 * the submit-signal to Postgres, which triggers the orchestration flow.
 * `accepted:true` means the signal was written — NOT that archival is
 * complete (the flow stamps the terminal status).
 */
export function makeRestFinalizeTransport(call: ApiCall): RequestFinalizeTransport {
  return async (req: FinalizeRequest): Promise<BoxResult<FinalizeAck>> => {
    try {
      const res = await call<ApiBoxResult<FinalizeAck>>(
        'POST',
        `/api/cases/${encodeURIComponent(req.caseId)}/box/finalize`,
        { payloadHash: req.payloadHash, evaPayload12: req.evaPayload12 },
      );
      return res;
    } catch (e) {
      return { status: 'error', message: (e as Error).message };
    }
  };
}
