/* Authenticated parser transport. The response keeps the stable
   `ParserResponse` contract used by manual intake. */

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
