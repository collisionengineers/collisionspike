/**
 * api/src/functions/proxy.ts — auxiliary BFF proxy routes (plan 21 §21.3).
 *
 * NOT part of the frozen DataAccess contract (R3) — distinct route prefixes keep the
 * §21.1 freeze unaffected. These replace the three SPA transports that today hit Power
 * Platform connectors; the API proxies the corresponding existing Python Function:
 *   POST /api/location-assist/suggest  -> location-suggest Function (Vision + Maps),
 *                                         gated by getLocationAssistGate -> SuggestedAddress[]
 *   POST /api/parser/parse             -> parser Function, gated by PDF_MAPPER_ENABLED
 *
 * Box byte/link ops stay in the box-webhook Function path (orchestration, plan 22).
 * Gated-off / proxy failure degrades to the same honest-empty the transports show today.
 */

import { app } from '@azure/functions';
import { withRole } from '../lib/auth.js';
import { gates } from '../lib/gates.js';
import { callLocationSuggest, callParser } from '../lib/functions-client.js';
import { resolveAssistImageBase64 } from '../lib/evidence-bytes.js';

interface AssistPhotoRef {
  evidence_id?: string;
  [key: string]: unknown;
}

/**
 * Enrich the location-assist request's photo_refs with inline base64 bytes (TKT-077). The Python
 * location function can't read Box directly; the API resolves evidence bytes (blob → Box facade)
 * and passes them inline so the function's InlinePhotoSource can OCR them. Photo count + per-photo
 * bytes are capped in resolveAssistImageBase64. Refs that don't resolve are still forwarded
 * (they degrade to a per-photo warning downstream). A malformed body is forwarded untouched.
 */
async function enrichLocationRequest(body: unknown): Promise<unknown> {
  if (!body || typeof body !== 'object') return body;
  const b = body as { photo_refs?: unknown };
  if (!Array.isArray(b.photo_refs) || b.photo_refs.length === 0) return body;
  const refs = b.photo_refs as AssistPhotoRef[];
  const ids = refs.map((r) => r?.evidence_id).filter((s): s is string => typeof s === 'string');
  const bytesById = await resolveAssistImageBase64(ids);
  if (bytesById.size === 0) return body;
  const enriched = refs.map((r) => {
    const b64 = r?.evidence_id ? bytesById.get(r.evidence_id) : undefined;
    return b64 ? { ...r, image_base64: b64 } : r;
  });
  return { ...b, photo_refs: enriched };
}

// POST /api/location-assist/suggest
app.http('locationAssistSuggest', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'location-assist/suggest',
  handler: withRole('CollisionSpike.User', async (req) => {
    if (!gates.locationAssistEnabled()) {
      return { status: 200, jsonBody: [] }; // gate off -> honest-empty (today's degradation)
    }
    try {
      const body = await req.json();
      const enriched = await enrichLocationRequest(body);
      const result = await callLocationSuggest(enriched);
      return { status: 200, jsonBody: result };
    } catch {
      return { status: 200, jsonBody: [] }; // proxy failure -> honest-empty
    }
  }),
});

// POST /api/parser/parse
app.http('parserParse', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'parser/parse',
  handler: withRole('CollisionSpike.User', async (req) => {
    if (!gates.pdfMapper()) {
      return { status: 200, jsonBody: { skipped: true } };
    }
    try {
      const body = await req.json();
      const result = await callParser(body);
      return { status: 200, jsonBody: result };
    } catch {
      // Parser proxy failure degrades honestly (mirrors locationAssistSuggest) instead of 500-ing.
      return { status: 200, jsonBody: { skipped: true, error: true } };
    }
  }),
});
