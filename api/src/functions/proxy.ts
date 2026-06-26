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
      const result = await callLocationSuggest(body);
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
