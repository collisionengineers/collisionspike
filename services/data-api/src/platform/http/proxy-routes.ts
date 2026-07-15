/**
 * services/data-api/src/platform/http/proxy-routes.ts — auxiliary BFF proxy routes (plan 21 §21.3).
 *
 * NOT part of the frozen DataAccess contract (R3) — distinct route prefixes keep the
 * §21.1 freeze unaffected. These replace the three SPA transports that today hit Power
 * Focused capability routes; the API proxies the corresponding Python service:
 *   POST /api/location-assist/suggest  -> location-suggest Function (Vision + Maps),
 *                                         gated by getLocationAssistGate -> SuggestedAddress[]
 *   POST /api/parser/parse             -> parser Function, gated by PDF_MAPPER_ENABLED
 *
 * Box byte/link ops stay in the box-webhook Function path (orchestration, plan 22).
 * Gated-off / proxy failure degrades to the same honest-empty the transports show today.
 */

import { app } from '@azure/functions';
import { withRole } from '../auth/staff-auth.js';
import { gates } from '../../features/settings/gates.js';
import { callLocationSuggest, callParser } from './service-client.js';
import { resolveAssistImageBase64 } from '../../features/evidence/bytes.js';

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
export async function enrichLocationRequest(body: unknown): Promise<unknown> {
  if (!body || typeof body !== 'object') return body;
  const b = body as { photo_refs?: unknown };
  if (!Array.isArray(b.photo_refs) || b.photo_refs.length === 0) return body;
  const refs = b.photo_refs as AssistPhotoRef[];
  const ids = refs.map((r) => r?.evidence_id).filter((s): s is string => typeof s === 'string');
  const bytesById = await resolveAssistImageBase64(ids);
  // SECURITY: NEVER trust caller-supplied inline bytes. A caller could otherwise put an
  // arbitrary/off-case `image_base64` on a ref — bypassing the resolver's RLS-scoped,
  // count/size-capped byte path — and have the downstream function OCR/send it. Strip any
  // caller `image_base64` from every ref, then set it back ONLY from bytesById (resolved
  // from on-case `evidence` rows within the caps). Unresolved refs keep their metadata but
  // carry no bytes (they degrade to a per-photo warning downstream).
  const enriched = refs.map((r) => {
    const { image_base64: _dropCallerBytes, ...rest } = (r ?? {}) as Record<string, unknown>;
    const b64 = typeof rest.evidence_id === 'string' ? bytesById.get(rest.evidence_id) : undefined;
    return b64 ? { ...rest, image_base64: b64 } : rest;
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
