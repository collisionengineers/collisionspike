/* ============================================================
   Connector-backed parser transport (CSP-safe).

   The deployed Code App runs under CSP `connect-src 'none'`, so a raw `fetch()`
   to the parser Function is refused before the network. The Power Apps SDK calls
   the **CE Parser** custom connector same-origin via the platform, and the
   function key lives on the CONNECTION (not in the client bundle). This module
   bridges the generated connector service to the seam's injectable
   `ParserTransport`, so the existing `parseDocument()` adapter is unchanged.

   Kept SEPARATE from parser-client.ts on purpose: that module stays import-pure
   of '@microsoft/power-apps' for the offline unit tests; only ManualIntake (which
   only ever renders inside the app) imports this connector-backed transport.
   ============================================================ */

import { CollisionEngineersParserService } from '../generated/services/CollisionEngineersParserService';
import type { ParseRequest, ParserResponse, ParserTransport } from './parser-client';

/** The generated service's request shape (structurally identical to ParseRequest). */
type GeneratedRequest = Parameters<typeof CollisionEngineersParserService.ParseDocument>[0];

/**
 * Live transport: POST the document to the CE Parser custom connector via the
 * Power Apps SDK. Both request and response derive from the same OpenAPI as the
 * local `ParseRequest`/`ParserResponse`, so the casts through `unknown` are a
 * type bridge, not a shape change.
 */
export const connectorParserTransport: ParserTransport = async (
  req: ParseRequest,
): Promise<ParserResponse> => {
  const result = await CollisionEngineersParserService.ParseDocument(
    req as unknown as GeneratedRequest,
  );
  if (!result.success) {
    throw new Error(
      `Parser connector call failed${result.error ? ` — ${result.error.message}` : ''}`,
    );
  }
  return result.data as unknown as ParserResponse;
};
