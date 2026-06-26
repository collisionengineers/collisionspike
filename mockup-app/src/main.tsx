/* ============================================================
   Collision Engineers — app bootstrap (plan 30 + 31).

   Replaces the Power Platform SDK bootstrap + PowerProvider wrap with:
     1. MSAL initialization + sign-in gate (plan 31)
     2. REST DataAccess injection (plan 30)
     3. REST transport injection for parser, location-assist, Box

   Identity flow: staff hit the SWA URL → MSAL redirects to Entra sign-in
   → returns authenticated → SPA acquires an API token silently → all
   fetch calls in rest-client.ts carry a Bearer token → the API validates
   the Entra JWT and enforces role-based access (CollisionSpike.User /
   CollisionSpike.Admin — plan 31).

   Config (all PUBLIC values — no secrets in the bundle):
     VITE_ENTRA_CLIENT_ID  — cespk-spa Application (client) ID
     VITE_ENTRA_TENANT_ID  — workforce tenant id
     VITE_API_SCOPE        — e.g. api://<API_APPID>/access_as_user
     VITE_API_BASE_URL     — e.g. https://cespk-api-dev.azurewebsites.net
   ============================================================ */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  FluentProvider,
  Toaster,
} from '@fluentui/react-components';
import {
  MsalProvider,
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
  useMsal,
} from '@azure/msal-react';
import { EventType } from '@azure/msal-browser';
import {
  msalInstance,
  acquireApiToken,
  API_SCOPES,
} from './auth/msalConfig';
import App from './App';
import { ceTheme } from './theme/ceTheme';
import { GLOBAL_TOASTER_ID } from './components';
import { configureDataAccess } from './data';
import { createRestDataAccess } from './data/rest-client';
import {
  configureLocationAssistTransport,
  makeRestLocationAssistTransport,
} from './data/location-assist-rest-transport';
import {
  configureBoxTransports,
} from './data/box-transport';
import {
  makeRestCopyFileRequestTransport,
  makeRestGetSharedLinkTransport,
  makeRestFinalizeTransport,
} from './data/box-rest-transport';
import './theme/theme.css';

/* ============================================================
   1. MSAL initialization (msal-browser v3+ requires explicit init).

   addEventCallback keeps the active account in sync after a sign-in
   (Learn: addEventCallback / setActiveAccount). The existing-accounts
   check handles a page reload where the token is already in sessionStorage.
   ============================================================ */

// Register the event callback BEFORE initialize() so it catches the redirect
// login event; the initialize() await itself happens in the async bootstrap below
// (top-level await isn't available at the SPA build target).
msalInstance.addEventCallback((m) => {
  if (
    m.eventType === EventType.LOGIN_SUCCESS &&
    m.payload &&
    'account' in m.payload
  ) {
    msalInstance.setActiveAccount(
      (m.payload as { account: import('@azure/msal-browser').AccountInfo }).account,
    );
  }
});

/* ============================================================
   2. REST DataAccess injection (plan 30).

   The `call` helper lives inside rest-client.ts (closed over opts).
   We create a thin wrapper so the three transports share the same
   authenticated fetch surface without re-acquiring the token.
   ============================================================ */

const restClient = createRestDataAccess({
  baseUrl: import.meta.env.VITE_API_BASE_URL as string,
  getToken: acquireApiToken,          // Bearer injected in call(), opaque to hooks
});
configureDataAccess(restClient);

/* ============================================================
   3. REST transport injection.

   The three transports share the same authenticated `call` helper from
   rest-client.ts.  We wire them at startup so the Box / location-assist /
   parser affordances are live by the time the first screen renders.

   Parser transport is injected per-call in ManualIntake:
     `parseDocument(req, makeRestParserTransport(call))`
   where `call` is re-exported from rest-client.ts.  No global injection
   needed for the parser because ManualIntake creates it inline.
   ============================================================ */

// Shared authenticated call helper for the three REST transports.
// We construct a minimal closure that mirrors the one inside rest-client.ts.
const sharedCall = async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
  const base = (import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '');
  const token = await acquireApiToken();
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok)
    throw new Error(
      `${method} ${path} → ${res.status} ${await res.text().catch(() => '')}`,
    );
  return (await res.json()) as T;
};

configureLocationAssistTransport(makeRestLocationAssistTransport(sharedCall));

configureBoxTransports({
  copyFileRequest: makeRestCopyFileRequestTransport(sharedCall),
  getSharedLink:   makeRestGetSharedLinkTransport(sharedCall),
  requestFinalize: makeRestFinalizeTransport(sharedCall),
});

/* ============================================================
   4. Sign-in gate.

   Staff-only: UnauthenticatedTemplate triggers a full-frame loginRedirect
   immediately — there is no "sign in" button, the app is internal-only.
   The redirect resumes via MSAL after Entra authentication.
   ============================================================ */

function SignInGate({ children }: { children: React.ReactNode }) {
  const { instance } = useMsal();
  return (
    <>
      <AuthenticatedTemplate>{children}</AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        {/* Staff-only: redirect straight to sign-in, no anonymous access. */}
        {void instance.loginRedirect({ scopes: API_SCOPES })}
      </UnauthenticatedTemplate>
    </>
  );
}

/* ============================================================
   5. App root.
   ============================================================ */

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

// MSAL v3 requires initialize() to resolve before any use; bootstrap async, then render.
void (async () => {
  await msalInstance.initialize();
  const existing = msalInstance.getAllAccounts();
  if (existing.length) msalInstance.setActiveAccount(existing[0]);

  createRoot(rootEl).render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <FluentProvider theme={ceTheme} style={{ height: '100%' }}>
          <SignInGate>
            <App />
          </SignInGate>
          <Toaster toasterId={GLOBAL_TOASTER_ID} position="bottom-end" />
        </FluentProvider>
      </MsalProvider>
    </StrictMode>,
  );
})();
