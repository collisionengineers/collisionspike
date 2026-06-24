/* ============================================================
   Collision Engineers — Code App: LIVE location-assist transport (deploy-wired).

   The connector-backed implementation of the injectable `LocationAssistTransport`
   declared in location-assist-client.ts. It bridges the generated
   `CollisionEngineersLocationAssistService.SuggestLocation` connector op to the
   pure client's transport contract, EXACTLY as parser-connector-transport.ts
   bridges `CollisionEngineersParserService.ParseDocument` for the parser — same
   authoring pattern, separate 'CE Location Assist' connector.

   Why STRUCTURAL injection (not a static import like the parser): the CE Location
   Assist custom connector is added at DEPLOY time (`pac code add-data-source`), so
   its generated service does not exist in the repo yet — a static import would
   break `tsc`. So this module imports NO '@microsoft/power-apps' and NO
   `src/generated/` service; it takes the generated service as a STRUCTURAL
   parameter, injected at startup in main.tsx after the connector is generated.
   (Same discipline box-connector-transport.ts uses for the dormant Box connector.)

   CSP-safety: the deployed Code App runs under `connect-src 'none'`, so a raw
   `fetch()` is refused before the network. The Power Apps SDK calls the custom
   connector same-origin via the platform; the FUNCTION KEY lives on the CONNECTION
   (x-functions-key, api_key auth), never in the client bundle — exactly like the
   parser. The function key is therefore never referenced here.
   ============================================================ */

import {
  type LocationAssistTransport,
  type SuggestLocationRequest,
  type SuggestLocationResponse,
} from './location-assist-client';

/* ----------  Structural shape of the generated connector op  ----------
   The real pac-generated `CollisionEngineersLocationAssistService.SuggestLocation`
   returns `{ success, data?, error? }` (the parser precedent:
   `IOperationResult<T>` is structurally `{ data?: T }`, but the connector services
   surface a `success` flag too — mirrored from box-connector-transport.ts). We
   restate the minimal shape so this module needs no SDK import; the generated
   class satisfies it. The request/response bodies mirror the CE Location Assist
   OpenAPI EXACTLY (the generator reads it), so the `unknown` bridge below is a
   type bridge, not a shape change. */
interface ConnectorResult<T> {
  success: boolean;
  data?: T;
  error?: { message?: string };
}

/**
 * The generated CE Location Assist service surface this module consumes. The
 * generated class (`class CollisionEngineersLocationAssistService` with a static
 * `async SuggestLocation(body)`) satisfies this structurally at injection time.
 * `body` is the snake_case request; the response is the camelCase envelope.
 */
export interface SuggestLocationOp {
  SuggestLocation(
    body: SuggestLocationRequest,
  ): Promise<ConnectorResult<SuggestLocationResponse>>;
}

/**
 * Build the live transport from the generated service. POSTs the request to the
 * CE Location Assist custom connector via the Power Apps SDK (same-origin, through
 * the platform). Both request and response derive from the same OpenAPI as the
 * pure `SuggestLocationRequest`/`SuggestLocationResponse`, so the cast through
 * `unknown` is a type bridge, not a shape change.
 *
 * Throws on a transport failure (the screen catches it and surfaces a plain
 * "couldn't suggest a location" message); Function-level soft failures arrive
 * in-band on the response `issues`/`noConfidentLocation` and are NOT thrown.
 */
export function makeConnectorLocationAssistTransport(
  svc: SuggestLocationOp,
): LocationAssistTransport {
  return async (req: SuggestLocationRequest): Promise<SuggestLocationResponse> => {
    const result = await svc.SuggestLocation(req);
    if (!result.success) {
      throw new Error(
        `Location assist connector call failed${
          result.error?.message ? ` — ${result.error.message}` : ''
        }`,
      );
    }
    if (!result.data) {
      throw new Error('Location assist returned no data.');
    }
    return result.data;
  };
}

/* ----------  The seam's active transport (not-configured until injected)  ----------
   Default is an honest "not connected" that throws a plain-language error — the
   feature is also gated OFF upstream (cr1bd_LOCATION_ASSIST_ENABLED defaults
   false), so this default never runs in practice. main.tsx calls
   `configureLocationAssistTransport(makeConnectorLocationAssistTransport(svc))`
   at startup AFTER the connector is generated. Offline unit tests inject a fake
   transport directly into `suggestLocations`, never touching this module. */

const notConnectedLocationAssistTransport: LocationAssistTransport = async () => {
  throw new Error('Location suggestions aren’t switched on yet.');
};

let active: LocationAssistTransport = notConnectedLocationAssistTransport;

/** Wire the live connector-backed transport (called once at app startup). */
export function configureLocationAssistTransport(transport: LocationAssistTransport): void {
  active = transport;
}

/** Reset to the not-connected default (tests / storybook). */
export function resetLocationAssistTransport(): void {
  active = notConnectedLocationAssistTransport;
}

/**
 * The currently-selected location-assist transport. The screen passes this to
 * `suggestLocations(req, activeLocationAssistTransport)`; it delegates to whatever
 * `configureLocationAssistTransport` last set (a function wrapper keeps the
 * reference stable across the swap).
 */
export const activeLocationAssistTransport: LocationAssistTransport = (req) => active(req);

export { notConnectedLocationAssistTransport };
