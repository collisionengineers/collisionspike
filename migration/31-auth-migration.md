# 31 — Auth migration

Today Power Platform supplies identity implicitly (`PowerProvider.getContext()`); the app does no
explicit auth and the connectors carry the credentials. Off Power Platform we add **Entra workforce
sign-in via MSAL** in the SPA and **JWT validation** in the API. Staff-only — **no External ID** (D8).
**Phase P1 (app registrations) + P5 (wiring).**

All three app registrations live in the **same workforce tenant** that owns `rg-collisionspike-dev`
("Accounts in this organizational directory only" — single-tenant). Verified on Microsoft Learn
(*Single-page application: Code configuration* — record the Application (client) ID + Directory
(tenant) ID from each app's Overview).

## Entra app registrations (3, created in P1)
| App | Type | Purpose |
|---|---|---|
| **SPA** (`cespk-spa`) | Single-page app (Auth Code + PKCE) | Staff sign-in; redirect = the SWA URL; requests the API scope |
| **Data API** (`cespk-api`) | Web/API (protected resource) | Exposes scope `access_as_user`; defines **app roles** `CollisionSpike.User` / `CollisionSpike.Admin`; validates tokens |
| **Graph daemon** (`cespk-graph-intake`) | Confidential client (app-only) | Holds `Mail.Read` **application** permission for the shared-mailbox subscription ([`22`](./22-orchestration-migration.md)); **admin consent required (operator step)** |

### Why three (not one)
Separating the SPA (public client) from the API (protected resource) is the standard delegated-flow
split: the SPA gets a token *for* the API audience; the API validates *its own* audience. The Graph
daemon is **app-only** (no user) because the subscription/renewal runs headless in the orchestration
app — a different credential class than the delegated user flow. Verified on Microsoft Learn
(*OAuth 2.0 authorization code flow → Redirect URIs for SPAs*): a `spa` redirect type enables PKCE +
CORS and **blocks client-credential use from the browser** when an `Origin` header is present — so the
public SPA reg can never be abused as a confidential client.

### `az` create sketch (P1 — read the ids back into the SPA/API/orchestration config)
```bash
TENANT=$(az account show --query tenantId -o tsv)
SWA_URL="https://<the-swa-hostname>"     # from `az staticwebapp show` after plan 30 §5

# 1) Data API app — expose the scope + define app roles FIRST (the SPA depends on its appId/scope)
API_APPID=$(az ad app create --display-name cespk-api \
  --sign-in-audience AzureADMyOrg --query appId -o tsv)
#  set Application ID URI, then add the access_as_user delegated scope + the two app roles via
#  `az ad app update --id $API_APPID --set api=... appRoles=...` (or the portal "Expose an API" +
#  "App roles" blades). App roles: value=CollisionSpike.User and value=CollisionSpike.Admin,
#  allowedMemberTypes=["User"]. Assign staff to roles under Enterprise Applications → Users and groups.

# 2) SPA app — SPA redirect (PKCE/CORS) + a pre-authorized API permission to access_as_user
SPA_APPID=$(az ad app create --display-name cespk-spa \
  --sign-in-audience AzureADMyOrg \
  --spa-redirect-uris "$SWA_URL" "http://localhost:5173" \
  --query appId -o tsv)
#  add a delegated permission to api://$API_APPID/access_as_user and grant admin consent.

# 3) Graph daemon (app-only) — Mail.Read APPLICATION permission, admin consent (operator)
GRAPH_APPID=$(az ad app create --display-name cespk-graph-intake --sign-in-audience AzureADMyOrg --query appId -o tsv)
#  add Microsoft Graph application permission Mail.Read (id 810c84a8-...), then:
#  az ad app permission admin-consent --id $GRAPH_APPID   ← operator/Global-Admin step (docs/gated.md)
```
> The `--spa-redirect-uris` flag is what puts the redirect URI in the **SPA platform** tile (the `spa`
> type), which is the PKCE+CORS path MSAL.js v2 requires — not the legacy **Web** tile. `localhost:5173`
> is added for local dev. The Graph daemon's secret/cert and `Mail.Read` admin consent are **operator
> blockers** — record them in [`docs/gated.md` equivalent] alongside the existing Power-Platform gates.

## SPA side (MSAL)

Add `@azure/msal-browser` + `@azure/msal-react`. Wrap the app in `MsalProvider` exactly where
`PowerProvider` used to be (`mockup-app/src/main.tsx`). Verified on Microsoft Learn (*Get started with
MSAL React*): all components needing auth must be under `MsalProvider`, which takes a single
`PublicClientApplication` instance created once per page load; acquire access tokens with
`acquireTokenSilent` and fall back to `acquireTokenRedirect` on failure (*Single-page application:
Acquire a token to call an API*).

```ts
// src/auth/msalConfig.ts
import { PublicClientApplication, type Configuration, InteractionRequiredAuthError } from '@azure/msal-browser';

const config: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_ENTRA_CLIENT_ID as string,                 // SPA appId
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_ENTRA_TENANT_ID}`,
    redirectUri: window.location.origin,                                      // the SWA URL (registered as spa type)
  },
  cache: { cacheLocation: 'sessionStorage' },                                 // staff workstations; no persistent token at rest
};

export const msalInstance = new PublicClientApplication(config);
export const API_SCOPES = [import.meta.env.VITE_API_SCOPE as string];          // e.g. api://<API_APPID>/access_as_user

/** The thunk injected into the REST client (plan 30). Silent-first, redirect fallback. */
export async function acquireApiToken(): Promise<string> {
  const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
  try {
    const r = await msalInstance.acquireTokenSilent({ scopes: API_SCOPES, account });
    return r.accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      await msalInstance.acquireTokenRedirect({ scopes: API_SCOPES, account }); // full-frame; resumes after redirect
    }
    throw e;
  }
}
```

```tsx
// src/main.tsx (the auth half — replaces the PowerProvider wrap)
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react';
import { EventType } from '@azure/msal-browser';
import { msalInstance, acquireApiToken, API_SCOPES } from './auth/msalConfig';
import { createRestDataAccess, configureDataAccess } from './data';

await msalInstance.initialize();                            // msal-browser v3+ requires explicit init
// keep the active account in sync after a sign-in (Learn: addEventCallback / setActiveAccount)
msalInstance.addEventCallback((m) => {
  if (m.eventType === EventType.LOGIN_SUCCESS && m.payload && 'account' in m.payload) {
    msalInstance.setActiveAccount((m.payload as { account: import('@azure/msal-browser').AccountInfo }).account);
  }
});
const existing = msalInstance.getAllAccounts();
if (existing.length) msalInstance.setActiveAccount(existing[0]);

configureDataAccess(createRestDataAccess({
  baseUrl: import.meta.env.VITE_API_BASE_URL as string,
  getToken: acquireApiToken,                               // token acquisition is opaque to the data hooks
}));

function SignInGate({ children }: { children: React.ReactNode }) {
  const { instance } = useMsal();
  return (
    <>
      <AuthenticatedTemplate>{children}</AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        {void instance.loginRedirect({ scopes: API_SCOPES })}            {/* staff-only: redirect straight to sign-in */}
      </UnauthenticatedTemplate>
    </>
  );
}

createRoot(rootEl).render(
  <StrictMode>
    <MsalProvider instance={msalInstance}>
      <FluentProvider theme={ceTheme} style={{ height: '100%' }}>
        <SignInGate><App /></SignInGate>
        <Toaster toasterId={GLOBAL_TOASTER_ID} position="bottom-end" />
      </FluentProvider>
    </MsalProvider>
  </StrictMode>,
);
```

- The token is attached as `Authorization: Bearer <token>` in `rest-client.ts`'s `call()`
  ([`30`](./30-frontend-preservation.md)) — **injected in the HTTP layer, not the query args**, so the
  data hooks/screens are auth-agnostic.
- Config (tenant id, SPA client id, API scope, authority) comes from `VITE_*` env vars at **build
  time**; the SPA client id, tenant id, scope and API URL are all **public** identifiers — no secret in
  the bundle.
- `acquireTokenSilent` is also safe to call **outside** the React tree (it can't change auth state);
  only the interactive `loginRedirect` / `acquireTokenRedirect` calls must stay under `MsalProvider`
  (Microsoft Learn *MSAL React FAQ*). Our thunk only does interactive on the redirect-fallback path,
  which runs from within a component-triggered request — acceptable.

### SWA built-in auth vs MSAL — chosen: MSAL alone
Static Web Apps offers a built-in EasyAuth gate (`staticwebapp.config.json` `routes` +
`allowedRoles: ["authenticated"]` + a `responseOverrides` 401 → `/.auth/login/aad`, per Microsoft
Learn *Add authentication to your static site in Azure Static Web Apps*). That gives a coarse "only
signed-in staff reach the SPA" gate but issues a **SWA** session, not an **Entra access token for the
API audience** — so we'd still need MSAL to call the API. Running both means two competing sign-ins.
**Decision: MSAL alone** — one clean Entra token flow that both gates the SPA (the `SignInGate`
redirect) and authorizes the API. We therefore omit the EasyAuth `routes`/`responseOverrides` block
from `staticwebapp.config.json`.

## API side (validation + authz)
The API ([`21`](./21-backend-api-build.md)) validates the Entra JWT on **every** request:
- **issuer** = `https://login.microsoftonline.com/<tenantId>/v2.0`; **audience** = the Data API app
  (`api://<API_APPID>` or its client id); **signature** via the tenant JWKS
  (`https://login.microsoftonline.com/<tenantId>/discovery/v2.0/keys`). Reject anonymous/invalid →
  401. Use a maintained validator (e.g. `jwks-rsa` + `jsonwebtoken`, or `passport-azure-ad`) — the
  Node/TS API owns this.
- Read the **`roles`** claim (app-role values) → enforce `CollisionSpike.User` vs `CollisionSpike.Admin`.
  Map to the privilege intent in `dataverse/roles/*.json` (carried over as the authz spec):
  - **User** — case/evidence/chaser/note CRUD; raise (not resolve) improvement signals; read corpus;
    **no** case delete.
  - **Admin** — User + corpus write + improvement-signal resolve + gate/app-setting management + audit
    **delete** (retention cascade only). **Audit is never UPDATE-able**, even by Admin.
- Optionally set the **Postgres RLS** role per request from the validated claim so the DB enforces the
  same boundary independently of the API code path ([`20`](./20-data-and-schema-migration.md) §2).

App roles are assigned to staff under **Enterprise Applications → cespk-api → Users and groups**;
unassigned users get a token with no `roles` claim → the API treats them as no-access (default-deny).

## Invariants carried from Dataverse roles
- **Audit append-only** — INSERT/SELECT for all; UPDATE for none; DELETE for Admin only. Enforced in
  the API write path **and** (belt-and-braces) by withholding UPDATE/DELETE grants in the Postgres
  role unless Admin-RLS.
- **Corpus archive-not-delete** — providers/repairers/inspection-addresses get `active=false`, never
  hard delete (withheld even from Admin) — referenced principal codes must survive for Case/PO history.
- **Default-deny** — roles grant only what's listed; there is **no** schema/flow/role-management
  surface in the app (that was System Administrator on Power Platform; now it's **Azure RBAC** on the
  resources — resource-group/Function/KV/Postgres admin — held separately from the two app roles).

## Operator blockers (record in the gated registry)
- **Admin consent** for the Graph daemon's `Mail.Read` application permission (Global Admin).
- **App-role assignment** of staff accounts to `CollisionSpike.User` / `.Admin`.
- The Graph daemon **client secret or certificate** (stored in Key Vault — [`11`](./11-secrets-and-keyvault.md));
  consumed by the orchestration app via Key Vault reference + its managed identity.

## Done-when (part of P6)
A staff user hits the SWA URL, is redirected to Entra sign-in, returns authenticated, the SPA acquires
an API token silently, the API validates it and resolves the correct role, and an Admin-only action
(e.g. flip the hold-new-cases gate) is **refused for a User token** (403) and **allowed for an Admin
token**. An unauthenticated request to any `/api/*` route returns 401.
</content>
