/* ============================================================
   Collision Engineers — Code App: PARSER endpoint config.

   The live document parser is an Azure Function (cespike-parser-dev) called
   FUNCTION-direct: a single POST to /api/parse with an `x-functions-key` header.

   APPROACH = DIRECT FETCH (not the custom connector). Justification:
     - It is ONE external call with a NON-SENSITIVE dev function key — the exact
       "simplest for a demo" path the task blesses (option b).
     - The custom connector (option a) would need a *connection* created + bound,
       then a re-run of `pac code add-data-source` to regenerate an SDK service,
       adding a new `@microsoft/power-apps` surface AND a connection dependency
       the manual-intake demo does not need. More moving parts, more fragility.
     - This client imports NO SDK (plain `fetch`), so the seam's offline boundary
       ('no @microsoft/power-apps import in src') stays intact.

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
