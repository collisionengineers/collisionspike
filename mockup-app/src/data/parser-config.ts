/* ============================================================
   Collision Engineers — Code App: PARSER endpoint config.

   The live document parser is an Azure Function (cespike-parser-dev). The
   PRODUCTION path is the CE Parser custom connector (connection ref
   `cr1bd_ceparser`) called via the @microsoft/power-apps SDK — same-origin, with
   AUTH SUPPLIED BY THE CONNECTION, not the app. The deployed Code App player
   enforces CSP `connect-src 'none'`, so a raw cross-origin fetch is BLOCKED on
   the deployed app anyway; the connector is the only viable path in production.
   Routing through the connector is PENDING (task #27 — "Wire CE Parser connector
   into Code App").

   NO SECRET IN SOURCE: `functionKey` defaults to '' (empty). The app must never
   carry a working function key as a source constant — the connector will supply
   auth in a later PR. For local-dev-only direct testing, inject a key at runtime
   via `configureParser({ functionKey })` from a gitignored .env, never commit it.

   The {document, filename} request contract (see parser-client.ts `ParseRequest`)
   is unchanged, so swapping `fetchParserTransport` for the generated connector
   service is a clean drop-in.
   ============================================================ */

export interface ParserConfig {
  /** Function host base URL (no trailing slash), e.g. https://….azurewebsites.net */
  baseUrl: string;
  /** The /api/parse route. */
  path: string;
  /** FUNCTION-level key sent as the `x-functions-key` header. */
  functionKey: string;
}

/** App default: the cespike-parser-dev Function host. NO KEY in source — the CE
    Parser connector supplies auth in production (task #27). For local-dev direct
    testing, inject via configureParser({ functionKey }) from a gitignored .env. */
const DEFAULT_PARSER_CONFIG: ParserConfig = {
  baseUrl: 'https://cespike-parser-dev-x7xt3d5ovhi7y.azurewebsites.net',
  path: '/api/parse',
  functionKey: '', // placeholder — populated at runtime / replaced by the connector
};

let active: ParserConfig = { ...DEFAULT_PARSER_CONFIG };

/** Override the parser endpoint/key (e.g. a different env). Rarely needed. */
export function configureParser(cfg: Partial<ParserConfig>): void {
  active = { ...active, ...cfg };
}

/** The fully-qualified parse URL. */
export function parserUrl(): string {
  return `${active.baseUrl}${active.path}`;
}

/** The current parser config (host/path/key). */
export function getParserConfig(): ParserConfig {
  return { ...active };
}
