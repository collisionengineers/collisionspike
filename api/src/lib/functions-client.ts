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
