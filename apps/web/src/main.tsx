/* Application bootstrap: sign-in, authenticated REST data, focused service
   transports, theme, and the global notification surface. Browser settings are
   public build-time values; secrets never belong in this bundle. */

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
  useMsalAuthentication,
} from '@azure/msal-react';
import { EventType, InteractionType } from '@azure/msal-browser';
import {
  msalInstance,
  acquireApiToken,
  API_SCOPES,
} from './auth/msalConfig';
import App from './app/App';
import { ceTheme } from './theme/ceTheme';
import { GLOBAL_TOASTER_ID } from './shared/ui';
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
  // Staff-only: trigger a redirect sign-in via the idiomatic hook. It fires
  // loginRedirect ONLY when no MSAL interaction is in progress and there is no
  // account — which guards against the interaction_in_progress double-fire that a
  // render-time loginRedirect caused (the sign-in redirect loop).
  useMsalAuthentication(InteractionType.Redirect, { scopes: API_SCOPES });
  return (
    <>
      <AuthenticatedTemplate>{children}</AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        <div style={{ padding: 24, fontFamily: 'Segoe UI, system-ui, sans-serif' }}>
          Signing you in…
        </div>
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
  // REQUIRED in redirect flow: consume the auth code Entra returns in the URL hash
  // BEFORE rendering. Without this the response is never processed, so the gate sees
  // "no account" and redirects again → the sign-in loop. (Fires LOGIN_SUCCESS, which
  // the callback above turns into setActiveAccount.)
  await msalInstance.handleRedirectPromise();
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
