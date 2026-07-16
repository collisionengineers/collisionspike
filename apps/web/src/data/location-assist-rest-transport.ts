/* Authenticated location-suggestion transport and its injectable selector. */

import {
  type LocationAssistTransport,
  type SuggestLocationRequest,
  type SuggestLocationResponse,
} from './location-assist-client';
import type { ApiCall } from './rest-client';

/**
 * Build the live REST location-assist transport from the shared
 * authenticated `call` helper.  POSTs the request to
 * `/api/location-assist/suggest`; the API proxies the Azure Function
 * and returns the same camelCase `SuggestLocationResponse` shape.
 *
 * Throws on a transport failure (the screen catches and surfaces a
 * plain "couldn't suggest a location" message); Function-level soft
 * failures arrive in-band on `issues`/`noConfidentLocation`.
 */
export function makeRestLocationAssistTransport(call: ApiCall): LocationAssistTransport {
  return async (req: SuggestLocationRequest): Promise<SuggestLocationResponse> =>
    call<SuggestLocationResponse>('POST', '/api/location-assist/suggest', req);
}

/* ----------  The seam's active transport (not-configured until injected)  ----------
   Default is an honest "not connected" that throws a plain-language error — the
   feature is also gated OFF upstream (LOCATION_ASSIST_ENABLED defaults false),
   so this default never runs in practice. main.tsx calls
   `configureLocationAssistTransport(makeRestLocationAssistTransport(call))`
   at startup. Offline unit tests inject a fake transport directly into
   `suggestLocations`, never touching this module. */

export const notConnectedLocationAssistTransport: LocationAssistTransport = async () => {
  throw new Error('Location suggestions aren’t switched on yet.');
};

let active: LocationAssistTransport = notConnectedLocationAssistTransport;

/** Wire the live REST-backed transport (called once at app startup). */
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
