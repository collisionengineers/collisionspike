/* ============================================================
   Collision Engineers — MSAL configuration (plan 31).

   Staff-only Entra sign-in via MSAL browser v3 (Auth Code + PKCE).
   All credentials are public Entra ids (client id, tenant id, scope
   URI) — no secret reaches the browser bundle. The only secret is the
   API itself, which validates the Entra JWT on every request.

   Entra app registrations (created in P1 — see docs/gated.md):
     - cespk-spa      : the SPA public client (PKCE+CORS redirect)
     - cespk-api      : the protected resource (access_as_user scope)
   ============================================================ */

import {
  PublicClientApplication,
  type Configuration,
  InteractionRequiredAuthError,
  BrowserAuthError,
} from '@azure/msal-browser';

const config: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_ENTRA_CLIENT_ID as string,          // SPA appId (cespk-spa)
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_ENTRA_TENANT_ID as string}`,
    redirectUri: window.location.origin,                                // the SWA URL (registered as spa type)
  },
  cache: { cacheLocation: 'sessionStorage' },                          // staff workstations; no persistent token at rest
};

export const msalInstance = new PublicClientApplication(config);

/** The delegated scope the SPA requests — the Data API's access_as_user.
 *  e.g. 'api://<API_APPID>/access_as_user' (set via VITE_API_SCOPE). */
export const API_SCOPES = [import.meta.env.VITE_API_SCOPE as string];

/**
 * The token thunk injected into the REST client (plan 30).
 * Silent-first (session cache); falls back to a full-frame redirect on
 * InteractionRequiredAuthError. The redirect resumes after sign-in, so
 * the app never gets stuck on a missing token.
 *
 * SAFE to call outside the React tree (acquireTokenSilent does not touch
 * auth state; only the redirect fallback does, and that only fires from
 * within a user-triggered request context).
 */
export async function acquireApiToken(): Promise<string> {
  const account =
    msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
  try {
    const r = await msalInstance.acquireTokenSilent({ scopes: API_SCOPES, account });
    return r.accessToken;
  } catch (e) {
    // Fall back to a full-frame redirect on ANY silent-acquisition failure: classic
    // interaction-required, but ALSO BrowserAuthError (hidden-iframe renewal timeout /
    // no cached account once the refresh-token lifetime lapses) — otherwise the SPA
    // dead-ends in an error state after ~24h instead of cleanly re-authing.
    if (e instanceof InteractionRequiredAuthError || e instanceof BrowserAuthError) {
      // The redirect navigates away; the call below never actually returns.
      await msalInstance.acquireTokenRedirect({ scopes: API_SCOPES, account });
    }
    throw e;
  }
}
