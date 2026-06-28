/**
 * orchestration/src/lib/functions-client.ts
 *
 * Typed fetch to the six existing **Python** Functions (plan 22 §B / §C). The language
 * boundary is just HTTP: the orchestration calls them with a Function key today (managed
 * identity later — plan 31), exactly as the flows did via connectors.
 *
 * The Box facade (CCG token mint) stays inside the `box-webhook` Function — the Box
 * orchestrations call its HTTP routes; they never re-mint Box tokens (plan 22 §C).
 *
 * App-settings: PARSER_FN_URL/PARSER_FN_KEY, ENRICH_FN_URL/ENRICH_FN_KEY,
 *   BOXWEBHOOK_FN_URL/BOXWEBHOOK_FN_KEY, EVASENTRY_FN_URL/EVASENTRY_FN_KEY,
 *   LOCATION_FN_URL/LOCATION_FN_KEY.
 */

interface FnTarget {
  urlEnv: string;
  keyEnv: string;
}

const PARSER: FnTarget = { urlEnv: 'PARSER_FN_URL', keyEnv: 'PARSER_FN_KEY' };
const ENRICH: FnTarget = { urlEnv: 'ENRICH_FN_URL', keyEnv: 'ENRICH_FN_KEY' };
const BOX: FnTarget = { urlEnv: 'BOXWEBHOOK_FN_URL', keyEnv: 'BOXWEBHOOK_FN_KEY' };
const EVA: FnTarget = { urlEnv: 'EVASENTRY_FN_URL', keyEnv: 'EVASENTRY_FN_KEY' };
const LOCATION: FnTarget = { urlEnv: 'LOCATION_FN_URL', keyEnv: 'LOCATION_FN_KEY' };

async function callFunction<T = unknown>(
  target: FnTarget,
  method: string,
  route: string,
  body?: unknown,
): Promise<T> {
  const base = process.env[target.urlEnv];
  const key = process.env[target.keyEnv];
  if (!base) throw new Error(`missing app-setting ${target.urlEnv}`);
  const url = `${base.replace(/\/$/, '')}/api/${route.replace(/^\//, '')}`;
  const res = await fetch(url, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(key ? { 'x-functions-key': key } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    // Throw so the Durable retry policy retries the calling activity (plan 22 §B).
    throw new Error(`fn ${method} ${route} → ${res.status}: ${await safeText(res)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ---------- parser ---------- */

export function callParser(caseId: string): Promise<unknown> {
  return callFunction(PARSER, 'POST', 'parse', { caseId });
}

/** Result of the parser's deterministic /classify-email route (ADR-0015). */
export interface ClassifyEmailResult {
  category: string;
  subtype: string;
  confidence?: number;
  signals?: string[];
  body_vrm?: string;
  body_caseref?: string;
}

/**
 * Email triage classifier — the parser's deterministic `/classify-email` route
 * (ADR-0015). Field names match the route contract EXACTLY (`from`, `sender_domain`,
 * `provider_match_state`, `attachment_kinds`, `has_attachments`); the route strips
 * HTML server-side. Always-on (deterministic); EMAIL_AI_ENABLED gates only the later
 * optional LLM refinement, never this call.
 */
export function callClassifyEmail(input: {
  subject?: string;
  body?: string;
  from?: string;
  senderDomain?: string;
  providerMatchState?: string;
  attachmentKinds?: string[];
  hasAttachments?: boolean;
}): Promise<ClassifyEmailResult> {
  return callFunction(PARSER, 'POST', 'classify-email', {
    subject: input.subject ?? '',
    body: input.body ?? '',
    from: input.from ?? '',
    sender_domain: input.senderDomain ?? '',
    provider_match_state: input.providerMatchState ?? '',
    attachment_kinds: input.attachmentKinds ?? [],
    has_attachments: input.hasAttachments ?? false,
  });
}

/* ---------- enrichment ---------- */

export function callEnrichment(caseId: string): Promise<unknown> {
  return callFunction(ENRICH, 'POST', 'enrich', { caseId });
}

/* ---------- EVA Sentry submit ---------- */

export function callEvaSubmit(caseId: string): Promise<unknown> {
  return callFunction(EVA, 'POST', 'submit', { caseId });
}

/* ---------- location-suggest ---------- */

export function callLocationSuggest(caseId: string): Promise<unknown> {
  return callFunction(LOCATION, 'POST', 'suggest', { caseId });
}

/* ---------- Box facade (box-webhook Function) ---------- */

export const box = {
  createFolder(name: string, parentId: string): Promise<{ id: string }> {
    return callFunction(BOX, 'POST', 'box/folders', { name, parent: { id: parentId } });
  },
  copyFileRequest(fileRequestId: string, folderId: string): Promise<unknown> {
    return callFunction(BOX, 'POST', `box/file-requests/${fileRequestId}/copy`, {
      folder: { id: folderId },
    });
  },
  listFolderItems(folderId: string): Promise<{ entries: Array<{ id: string; name: string }> }> {
    return callFunction(BOX, 'GET', `box/folders/${folderId}/items`);
  },
  folderSharedLink(folderId: string): Promise<{ shared_link?: { url: string } }> {
    return callFunction(BOX, 'PUT', `box/folders/${folderId}/shared-link`, {});
  },
};

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<no body>';
  }
}
