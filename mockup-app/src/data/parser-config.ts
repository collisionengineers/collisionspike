/* ============================================================
   Collision Engineers — Code App: PARSER endpoint config.

   The live document parser is an Azure Function (cespike-parser-dev) called
   FUNCTION-direct: a single POST to /api/parse with an `x-functions-key` header.

   APPROACH = DIRECT FETCH (not the custom connector). NOTE: the deployed Code App
   player enforces CSP `connect-src 'none'`, so the direct fetch is BLOCKED on the
   deployed app and only works on localhost / offline tests. The production path is
   the CE Parser custom connector via the @microsoft/power-apps SDK (same-origin;
   key in the connection). Routing through the connector is PENDING (task #27).

   The host + key live here as the app default. They are overridable at runtime
   via `configureParser(...)` (tests inject a fake transport instead — see
   parser-client.ts), so nothing here is load-bearing for the unit tests.

   NOTE: this key is a DEV function key for a throwaway sandbox Function. It is not
   a tenant secret. For a production build this would move behind the custom
   connector + a Dataverse-stored connection (option a).
   ============================================================ */

export interface ParserConfig {
  /** Function host base URL (no trailing slash), e.g. https://….azurewebsites.net */
  baseUrl: string;
  /** The /api/parse route. */
  path: string;
  /** FUNCTION-level key sent as the `x-functions-key` header. */
  functionKey: string;
}

/** App default: the live cespike-parser-dev Function + its dev function key. */
const DEFAULT_PARSER_CONFIG: ParserConfig = {
  baseUrl: 'https://cespike-parser-dev-x7xt3d5ovhi7y.azurewebsites.net',
  path: '/api/parse',
  functionKey: 'A31IJ9kySfjhR-9bizHWvjWoXk7uDvEuLfDcd1gkJnWxAzFuzYZHaA==',
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
