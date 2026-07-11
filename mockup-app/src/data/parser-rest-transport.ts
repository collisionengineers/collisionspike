/* ============================================================
   Collision Engineers — REST parser transport (plan 30 §3).

   Replaces `parser-connector-transport.ts`. Off Power Platform the SPA
   legitimately fetch-es the API origin (CORS-allowed), so the live
   transport is a straight POST carrying the same Bearer token as all
   other REST calls.

   The API proxies the Python parser Function over HTTP and returns its
   `ParserResponse` shape without remapping it.
   The injectable `ParserTransport` contract (parser-client.ts) is
   unchanged, so `parseDocument(req, makeRestParserTransport(call))`
   in ManualIntake is a drop-in replacement.
   ============================================================ */

import type { ParseRequest, ParserResponse, ParserTransport } from './parser-client';
import type { ApiCall } from './rest-client';

/**
 * Build the live REST parser transport from the shared authenticated
 * `call` helper exported by `rest-client.ts`.  POST to `/api/parser/parse`;
 * the API proxies the Python cespike-parser Function and returns the same
 * `ParserResponse` wire shape.
 */
export function makeRestParserTransport(call: ApiCall): ParserTransport {
  return async (req: ParseRequest): Promise<ParserResponse> =>
    call<ParserResponse>('POST', '/api/parser/parse', req);
}
