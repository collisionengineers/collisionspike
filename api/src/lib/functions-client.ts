/**
 * api/src/lib/functions-client.ts — typed HTTP client for Python Function stages called by the API.
 *
 * The API calls the Python Functions over HTTP with a function key (x-functions-key header),
 * exactly as the Power Automate flows did via connectors. Managed-identity auth to the Functions
 * is a later step (plan 31).
 *
 * App-settings required per Function (set via Azure portal / az CLI, KV-referenced):
 *   PARSER_FN_URL          / PARSER_FN_KEY
 *   LOCATION_SUGGEST_FN_URL / LOCATION_SUGGEST_FN_KEY
 *   ENRICH_FN_URL          / ENRICH_FN_KEY
 *   (evasentry, evavalidation, box-webhook are called by orchestration, not the API)
 *
 * Vehicle enrichment is owned by the Data API: every automated intake, staff
 * retry, and manual preview passes through the same authenticated route and this
 * one validated Function client.
 *
 * TODO (api-build agent): add typed request/response types for each remaining Python Function's
 * HTTP contract once those Function signatures are confirmed.
 */

import {
  parseVehicleDataEnrichmentResponse,
  type VehicleDataEnrichmentResponse,
} from '@cs/domain';

/** Default bound for the latency-sensitive image-analysis stage calls (OCR / location-suggest) —
 *  matches the AOAI adapter timeout so every image-analysis stage degrades on a slow/stuck host
 *  instead of holding the HTTP invocation open until the Functions host timeout. */
export const FN_STAGE_TIMEOUT_MS = 30_000;

/** A dependency response failed after transport retries. Carries status only; the
 * upstream body can contain customer data and is deliberately not retained. */
export class FunctionCallError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'FunctionCallError';
  }
}

export async function callVehicleData(input: {
  registration: string;
  documentHasMileage: boolean;
  targetDate?: string;
  idempotencyKey?: string;
}): Promise<VehicleDataEnrichmentResponse> {
  const base = process.env.ENRICH_FN_URL;
  const key = process.env.ENRICH_FN_KEY;
  if (!base || !key) {
    throw new Error('[functions-client] ENRICH_FN_URL/ENRICH_FN_KEY not configured');
  }
  const raw = await callFn(
    base,
    key,
    'POST',
    '/api/dvsa-mot/enrich',
    {
      vrm: input.registration,
      document_has_mileage: input.documentHasMileage,
      ...(input.targetDate ? { target_date: input.targetDate } : {}),
      ...(input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {}),
    },
    { timeoutMs: FN_STAGE_TIMEOUT_MS },
  );
  const parsed = parseVehicleDataEnrichmentResponse(raw);
  if (!parsed) throw new Error('[functions-client] vehicle-data response failed contract validation');
  return parsed;
}

async function callFn(
  baseUrl: string,
  fnKey: string,
  method: string,
  path: string,
  body?: unknown,
  opts?: { timeoutMs?: number },
): Promise<unknown> {
  // Opt-in timeout: undefined => no AbortController (unchanged behaviour for the parser/enrichment/
  // Box callers whose work can legitimately run long). A bounded caller (OCR/location) aborts the
  // fetch on the deadline so a stuck upstream can't pin the request open.
  const timeoutMs = opts?.timeoutMs;
  const controller = timeoutMs != null ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-functions-key': fnKey,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!res.ok) {
      // Consume the response so the connection can be reused, but never put its
      // body in an exception (Box/API errors can echo names and identifiers).
      await res.text().catch(() => '');
      throw new FunctionCallError(
        `[functions-client] ${method} ${path} returned HTTP ${res.status}`,
        res.status,
      );
    }
    return res.json();
  } catch (e) {
    if (controller?.signal.aborted) {
      throw new Error(`[functions-client] ${method} ${path} → timed out after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// --- Parser Function ---
export async function callParser(body: unknown): Promise<unknown> {
  return callFn(
    process.env.PARSER_FN_URL!,
    process.env.PARSER_FN_KEY!,
    'POST',
    '/api/parse',
    body,
  );
}

// --- Location-suggest Function ---
// `opts.timeoutMs` is opt-in: the image-analysis adapter bounds it (a stuck location host must
// degrade the address stage, not hang the run); the interactive proxy route omits it so the
// operator-invoked deep photo-reasoning path keeps its longer natural budget.
export async function callLocationSuggest(
  body: unknown,
  opts?: { timeoutMs?: number },
): Promise<unknown> {
  return callFn(
    process.env.LOCATION_SUGGEST_FN_URL!,
    process.env.LOCATION_SUGGEST_FN_KEY!,
    'POST',
    '/api/location-suggest',
    body,
    opts,
  );
}

// --- OCR Function: fast-alpr plate read (TKT-016 stage 4 / TKT-017) ---
// The registration read of record is the LOCAL fast-alpr `/api/plate-ocr` route on the retained
// OCR Function (`cespkocr-fn-dev`) — UK-resident, zero-egress; the plate detector localises the
// plate (avoids the whole-photo-OCR false positive, TKT-017 finding F1). The orchestration app
// already speaks this contract (orchestration/src/lib/functions-client.ts::callPlateOcr); this is
// the Data-API-side twin so the image-analysis producer can read a plate without routing the crop
// through the GlobalStandard VLM. Configured via OCR_FN_URL / OCR_FN_KEY (same names orch uses);
// absent => the caller degrades to "reg-OCR not run".
export interface PlateOcrResult {
  plate_text: string;
  confidence?: number | null;
  /** True when a plate was read (and, when case_vrm was supplied, it matched). */
  registration_visible: boolean;
  vrm_match?: string | null;
}

export async function callPlateOcr(input: {
  imageBase64: string;
  filename: string;
  caseVrm?: string;
}): Promise<PlateOcrResult> {
  const base = process.env.OCR_FN_URL;
  const key = process.env.OCR_FN_KEY;
  if (!base || !key) throw new Error('[functions-client] OCR_FN_URL/OCR_FN_KEY not configured');
  // Bounded — the image-analysis route calls this sequentially across up to 8 images; a slow OCR
  // host must degrade the reg stage (adapter catches → null), never hold the invocation open.
  return callFn(
    base,
    key,
    'POST',
    '/api/plate-ocr',
    {
      image: input.imageBase64,
      filename: input.filename,
      ...(input.caseVrm ? { case_vrm: input.caseVrm } : {}),
    },
    { timeoutMs: FN_STAGE_TIMEOUT_MS },
  ) as Promise<PlateOcrResult>;
}

// --- Box-webhook Function: folder listing (Case/PO allocator Box fallback) ---
// The retained box-webhook Function exposes GET box/folders/{folderId}/items (a thin proxy
// of the Box ListFolder op). It is normally called by orchestration; the Data API calls it
// ONLY for the Case/PO allocator's brand-new-provider fallback (work-todo-spike: case-po-gen).
// Configured via BOX_FN_URL / BOX_FN_KEY (absent => the caller skips the fallback).
interface BoxFolderEntry {
  id?: string;
  name?: string;
  type?: string;
}
interface BoxListFolderResponse {
  entries?: BoxFolderEntry[];
  total_count?: number;
  limit?: number;
  offset?: number;
}

export async function callBoxListFolder(
  folderId: string,
  limit = 1000,
  offset = 0,
): Promise<BoxListFolderResponse> {
  const base = process.env.BOX_FN_URL;
  const key = process.env.BOX_FN_KEY;
  if (!base || !key) throw new Error('[functions-client] BOX_FN_URL/BOX_FN_KEY not configured');
  return callFn(
    base,
    key,
    'GET',
    `/api/box/folders/${encodeURIComponent(folderId)}/items?limit=${limit}&offset=${offset}`,
  ) as Promise<BoxListFolderResponse>;
}

export interface BoxWriteScopeAttestation {
  writable?: unknown;
  rootId?: unknown;
}

/**
 * Ask the Box facade to prove that its WRITE lock is configured and that the
 * candidate folder is the lock root or a descendant. This is read-only, but it
 * intentionally fails when BOX_ALLOWED_ROOT_ID is unset.
 */
export async function verifyBoxWriteScope(folderId: string): Promise<BoxWriteScopeAttestation> {
  const base = process.env.BOX_FN_URL;
  const key = process.env.BOX_FN_KEY;
  if (!base || !key) throw new Error('[functions-client] BOX_FN_URL/BOX_FN_KEY not configured');
  return callFn(
    base,
    key,
    'POST',
    '/api/box/scope/write-check',
    { folderId },
    { timeoutMs: FN_STAGE_TIMEOUT_MS },
  ) as Promise<BoxWriteScopeAttestation>;
}

/**
 * Page through a Box folder and return ALL entry names (sub-folders + files). Box paginates,
 * so this loops on offset until a short page (capped at 20 pages / ~20k entries as a safety
 * net). Best-effort: throws on a transport/config error (callers catch and fall back to DB).
 */
export async function listBoxFolderNames(folderId: string): Promise<string[]> {
  const names: string[] = [];
  const limit = 1000;
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    const res = await callBoxListFolder(folderId, limit, offset);
    const entries = res.entries ?? [];
    for (const e of entries) if (e?.name) names.push(String(e.name));
    if (entries.length < limit) break;
    offset += limit;
  }
  return names;
}

/**
 * Page through a Box folder and return sub-FOLDER {id,name} entries (TKT-107 archive lookup).
 * Same pagination + safety cap as listBoxFolderNames but keeps the id so a server-minted
 * "Open in Box" deep link can be built. Best-effort: throws on transport/config error (callers
 * catch and degrade to "no archive result").
 */
export async function listBoxFolderEntries(
  folderId: string,
): Promise<Array<{ id: string; name: string }>> {
  const out: Array<{ id: string; name: string }> = [];
  const limit = 1000;
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    const res = await callBoxListFolder(folderId, limit, offset);
    const entries = res.entries ?? [];
    for (const e of entries) {
      if (e?.type === 'folder' && e.id && e.name) out.push({ id: String(e.id), name: String(e.name) });
    }
    if (entries.length < limit) break;
    offset += limit;
  }
  return out;
}

/** Raw success contract returned by the Box facade's CopyFileRequest operation. */
export interface BoxFileRequestCopyResponse {
  id?: unknown;
  url?: unknown;
  folder?: unknown;
  status?: unknown;
  expires_at?: unknown;
}

export type BoxFileRequestResponse = BoxFileRequestCopyResponse;

function boxFileRequestExpiry(): string {
  const configured = Number(process.env.BOX_FILE_REQUEST_EXPIRY_DAYS ?? '30');
  const days = Number.isFinite(configured) ? Math.min(90, Math.max(1, configured)) : 30;
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/**
 * Copy the operator-provisioned Box File Request template onto one case folder.
 * The caller validates the facade response before stamping it onto the case.
 */
export async function callBoxCopyFileRequest(
  templateId: string,
  folderId: string,
  opts?: { timeoutMs?: number },
): Promise<BoxFileRequestCopyResponse> {
  const base = process.env.BOX_FN_URL;
  const key = process.env.BOX_FN_KEY;
  if (!base || !key) throw new Error('[functions-client] BOX_FN_URL/BOX_FN_KEY not configured');
  const configured = Number(process.env.BOX_FILE_REQUEST_COPY_TIMEOUT_MS ?? FN_STAGE_TIMEOUT_MS);
  const timeoutMs = opts?.timeoutMs ?? (
    Number.isFinite(configured) ? Math.min(60_000, Math.max(5_000, configured)) : FN_STAGE_TIMEOUT_MS
  );
  return callFn(
    base,
    key,
    'POST',
    `/api/box/file-requests/${encodeURIComponent(templateId)}/copy`,
    {
      folder: { id: folderId },
      status: 'active',
      // Never inherit an already-expired template date. A later chaser validates
      // the request remotely and renews it when this date passes.
      expires_at: boxFileRequestExpiry(),
    },
    { timeoutMs },
  ) as Promise<BoxFileRequestCopyResponse>;
}

/** Read and server-validate a persisted File Request against its case folder. */
export async function callBoxGetFileRequest(
  fileRequestId: string,
  expectedFolderId: string,
  opts?: { timeoutMs?: number },
): Promise<BoxFileRequestResponse> {
  const base = process.env.BOX_FN_URL;
  const key = process.env.BOX_FN_KEY;
  if (!base || !key) throw new Error('[functions-client] BOX_FN_URL/BOX_FN_KEY not configured');
  return callFn(
    base,
    key,
    'GET',
    `/api/box/file-requests/${encodeURIComponent(fileRequestId)}?folderId=${encodeURIComponent(expectedFolderId)}`,
    undefined,
    { timeoutMs: opts?.timeoutMs ?? FN_STAGE_TIMEOUT_MS },
  ) as Promise<BoxFileRequestResponse>;
}

/** Reactivate an inactive/expired request after the facade re-validates its folder. */
export async function callBoxReactivateFileRequest(
  fileRequestId: string,
  expectedFolderId: string,
  opts?: { timeoutMs?: number },
): Promise<BoxFileRequestResponse> {
  const base = process.env.BOX_FN_URL;
  const key = process.env.BOX_FN_KEY;
  if (!base || !key) throw new Error('[functions-client] BOX_FN_URL/BOX_FN_KEY not configured');
  return callFn(
    base,
    key,
    'PUT',
    `/api/box/file-requests/${encodeURIComponent(fileRequestId)}?folderId=${encodeURIComponent(expectedFolderId)}`,
    { status: 'active', expires_at: boxFileRequestExpiry() },
    { timeoutMs: opts?.timeoutMs ?? FN_STAGE_TIMEOUT_MS },
  ) as Promise<BoxFileRequestResponse>;
}

interface BoxFileContentResponse {
  id?: string;
  filename?: string;
  size?: number;
  contentBase64?: string;
}

/**
 * Fetch an archived Box file's raw bytes via the facade (GET box/files/{id}/content — base64
 * in JSON, size-capped inside the box-fn). Used to inline-preview Box-only evidence that has
 * no local blob (~39% of rows). Returns undefined when the facade is unconfigured, the gate is
 * off, or the file is too big / absent — the caller falls back to the "Open in Archive" link.
 */
export async function downloadBoxFileContent(
  fileId: string,
): Promise<{ bytes: Buffer; filename?: string } | undefined> {
  const base = process.env.BOX_FN_URL;
  const key = process.env.BOX_FN_KEY;
  if (!base || !key) return undefined;
  try {
    const res = (await callFn(
      base,
      key,
      'GET',
      `/api/box/files/${encodeURIComponent(fileId)}/content`,
    )) as BoxFileContentResponse;
    if (!res?.contentBase64) return undefined;
    return { bytes: Buffer.from(res.contentBase64, 'base64'), filename: res.filename };
  } catch {
    return undefined;
  }
}
