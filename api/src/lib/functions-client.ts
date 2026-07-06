/**
 * api/src/lib/functions-client.ts — typed HTTP client for the 6 existing Python Functions.
 *
 * The API calls the Python Functions over HTTP with a function key (x-functions-key header),
 * exactly as the Power Automate flows did via connectors. Managed-identity auth to the Functions
 * is a later step (plan 31).
 *
 * App-settings required per Function (set via Azure portal / az CLI, KV-referenced):
 *   PARSER_FN_URL          / PARSER_FN_KEY
 *   ENRICH_FN_URL          / ENRICH_FN_KEY
 *   LOCATION_SUGGEST_FN_URL / LOCATION_SUGGEST_FN_KEY
 *   (evasentry, evavalidation, box-webhook are called by orchestration, not the API)
 *
 * TODO (api-build agent): add typed request/response types for each Python Function's
 * HTTP contract once those Function signatures are confirmed.
 */

async function callFn(
  baseUrl: string,
  fnKey: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-functions-key': fnKey,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    throw new Error(`[functions-client] ${method} ${path} → ${res.status} ${await res.text().catch(() => '')}`);
  }
  return res.json();
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

// --- Enrichment Function ---
export async function callEnrichment(body: unknown): Promise<unknown> {
  return callFn(
    process.env.ENRICH_FN_URL!,
    process.env.ENRICH_FN_KEY!,
    'POST',
    '/api/enrich',
    body,
  );
}

// --- Location-suggest Function ---
export async function callLocationSuggest(body: unknown): Promise<unknown> {
  return callFn(
    process.env.LOCATION_SUGGEST_FN_URL!,
    process.env.LOCATION_SUGGEST_FN_KEY!,
    'POST',
    '/api/location-suggest',
    body,
  );
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
