# 30 — Frontend preservation

The React app is preserved almost entirely. The seam is airtight: screens import only from `../data`
(and the pure `../contracts` / `../domain` / `../mock` helpers), **never** the Power Apps SDK — so
swapping the data source touches the `src/data/*` seam and the bootstrap, and **zero screens**. **Phase
P5.** Source: `mockup-app/`.

Two structural facts make this cheap, both verified against the real tree:
1. The seam is a **selector + Proxy** (`src/data/index.ts`): `configureDataAccess(source)` swaps the
   live `DataAccess` behind a stable `data` Proxy. Today `main.tsx` injects the Dataverse source; the
   new app injects the REST source. **One injection point changes.**
2. The only modules that import `@microsoft/power-apps` or `src/generated/` are
   `PowerProvider.tsx`, `main.tsx`, `generated-services.ts`, and the three `*-connector-transport.ts`
   files. Everything else (the screens, `contracts/`, `domain/`, `mock/`, the pure `*-client.ts`
   adapters, `dataverse-source.ts`, `adapter.ts`, `hooks.ts`, `types.ts`) is already SDK-free.

> Off Power Platform there is **no Dataverse OData API and no connectors** — so the REST client returns
> the camelCase **domain** shapes directly (the P3 API does the choiceset-int↔enum mapping server-side,
> reusing the same `@cs/domain` package — D10). The client therefore stops needing the `cr1bd_*`
> record adapters and choice codecs entirely; that logic **moves to the shared package + the API**, it
> is not re-kept on the client.

---

## 0. Workspace layout — the SPA imports the shared domain package (D10)

Today `mockup-app` is a standalone Vite app; `contracts/` + `domain/` + the pure parts of `mock/` live
inside it and are imported with relative paths. The API and orchestration ([`21`](./21-backend-api-build.md),
[`22`](./22-orchestration-migration.md)) must run the **same** business rules, so we hoist the
platform-neutral code into one **npm-workspaces** package and have all three consumers import it.

```
collisionspike/                         (repo root — new root package.json with "workspaces")
├─ package.json                         { "private": true, "workspaces": ["packages/*","mockup-app","api","orchestration"] }
├─ packages/
│  └─ domain/                           @cs/domain  — the ONE source of truth for the rules
│     ├─ package.json                   { "name":"@cs/domain", "type":"module", "exports": "./src/index.ts" }
│     ├─ tsconfig.json
│     └─ src/
│        ├─ contracts/                  ← moved verbatim from mockup-app/src/contracts/
│        │   (case-status, eva-export, image-rules + parity tests)
│        ├─ domain/                     ← moved verbatim from mockup-app/src/domain/
│        │   (classification, provider-match, address-policy, dedup)
│        ├─ model/                      ← the PURE domain TYPES + helpers lifted out of mock/
│        │   (Case, Evidence, Provider, EvaFields, QueueName, LiveCounts, Throughput,
│        │    AgingExceptions, statusToQueue, dueInfo, suggestCasePo, QUEUES, REASON_LABELS …)
│        ├─ dto/                        ← the seam DTOs lifted out of data/types.ts
│        │   (DataAccess interface, CreateCaseInput, SuggestedAddress, BoxGates,
│        │    LocationAssistGate, InboundEmail, InboundCounts, … — NO cr1bd_* record shapes)
│        ├─ codecs/                     ← adapter.ts choice-codec + DD/MM/YYYY logic (API uses it)
│        │   (makeChoiceCodec + the choicesets/*.json imports — server-side enum↔int↔string)
│        └─ index.ts                    barrel re-exporting contracts + domain + model + dto
├─ mockup-app/                          the SPA (keeps screens, components, theme, mock fixtures, data seam)
├─ api/                                 the BFF Function App (TS/Node — plan 21)
└─ orchestration/                       Durable + webhook (TS/Node — plan 22)
```

**What moves vs stays (mockup-app/src):**

| From | To | Note |
|---|---|---|
| `src/contracts/**` | `packages/domain/src/contracts/**` | verbatim; the API + SPA both import it |
| `src/domain/**` | `packages/domain/src/domain/**` | verbatim |
| `src/mock/types.ts`, `mock/queues.ts`, `mock/intake.ts` — the **type + pure-helper** parts | `packages/domain/src/model/**` | the **fixture rows** (`mock/cases.ts` etc.) STAY in the SPA |
| `src/data/types.ts` — the `DataAccess` interface + the domain DTOs | `packages/domain/src/dto/**` | the `cr1bd_*` `*Record` + `GeneratedServices` shapes are **deleted** (Dataverse-only) |
| `src/data/adapter.ts` — choice codecs + date helpers | `packages/domain/src/codecs/**` | the **API** imports these to map Postgres enum ↔ EVA int ↔ enum string (R4); the **client no longer imports them** |
| `dataverse/choicesets/*.json` (referenced by the codecs) | stays at repo root | already imported out-of-`src`; the package references it the same way |

**Import rewrite in the SPA (mechanical find/replace, no logic change):**
`../contracts` / `../../contracts` → `@cs/domain`; `../domain` → `@cs/domain`; the moved `../mock/*`
type/helper imports → `@cs/domain`. The remaining `../mock/*` fixture imports stay relative. Add to
`mockup-app/package.json` dependencies: `"@cs/domain": "*"`. Vitest/Vite resolve the workspace symlink
natively; `resolveJsonModule` (already on) keeps the choicesets JSON import working from the package.

> The barrel `src/data/index.ts` keeps re-exporting the domain types/helpers (now from `@cs/domain`)
> so screens that import them through `../data` are **unchanged**. Only the import *behind* the barrel
> repoints.

---

## 1. KEEP as-is (~11.5k LOC, zero logic change)
- `mockup-app/src/screens/**` (Dashboard, CaseDetail, CaseList, ManualIntake, EvaSubmitDialog,
  AddEvidence, ActionLogs, Admin, MergeCaseDialog, Inbox)
- `mockup-app/src/components/**`, `mockup-app/src/theme/**`, `src/App.tsx`
- `mockup-app/src/mock/**` (the demo **fixture** rows + the intake helpers that the empty/default
  source and the vitest suite use — pure, no SDK)
- `src/data/hooks.ts` — the React query hooks over the async fetchers; they read `getDataAccess()` at
  call time, so they bind to the REST source with **no change**.
- `src/data/index.ts` — the barrel + `configureDataAccess` / `getDataAccess` / `data` Proxy selector.
  Only its imports repoint (`@cs/domain`, and `createRestDataAccess` instead of
  `createDataverseDataAccess`); the **selector machinery is unchanged**.
- The pure injectable adapters the **screens import through the barrel**:
  `src/data/parser-client.ts`, `src/data/location-assist-client.ts`, `src/data/box-transport.ts`,
  `src/data/enrichment-client.ts` — they define the transport *contracts* + the pure response
  adapters + the `notConnected*` defaults. **Kept**; only the concrete transports injected into them
  change (§3).
- `src/data/mock-source.ts` — the empty/default `DataAccess`; still the pre-injection default and the
  test source.

These compile unchanged once the seam is swapped and the imports repoint.

## 2. REWRITE — the data seam (the Dataverse implementation → one `rest-client.ts`)

Replace the Dataverse-backed `DataAccess` with a `fetch`+Bearer client calling the P3 API
([`21`](./21-backend-api-build.md)). The API returns **domain JSON** already, so the client is a thin
HTTP layer — no `cr1bd_*` records, no choice ints, no OData on the client.

| File | Action |
|---|---|
| `src/data/dataverse-source.ts` (~1,000) | **Replace** with `rest-client.ts` (`createRestDataAccess`) implementing `DataAccess` over `fetch` + Bearer. The queue/dashboard windowing math that lived here moves **server-side** into the API (it owns the aggregates now); the client just GETs `/api/dashboard/*`. |
| `src/data/adapter.ts` (~630) | **Move** to `@cs/domain/codecs` for the API to reuse (§0). **Removed from the client** — the REST client never sees Dataverse integers. |
| `src/data/generated-services.ts` (~100) | **Delete** — pac-generated Dataverse service bundle; no analogue off Power Platform. |
| `src/data/box-gates.ts` (~150) | **Delete from the client** — the env-var-row → `BoxGates` parsing moves server-side; the client GETs `/api/gates/box` and receives a `BoxGates` object. (Keep the *pure tests'* expectations as API tests.) |
| `src/data/box-connector-transport.ts` (~280) | **Replace** with `box-rest-transport.ts` — `fetch` to `/api/cases/{id}/box/*` (§3). |
| `src/data/parser-connector-transport.ts` (~40) | **Replace** with `parser-rest-transport.ts` — `fetch` to `/api/parser/parse` (§3). |
| `src/data/location-assist-connector-transport.ts` (~120) | **Replace** with `location-assist-rest-transport.ts` — `fetch` to `/api/location-assist/suggest` (§3). |

### `rest-client.ts` design

`createRestDataAccess(opts)` returns a `DataAccess`. It is injected the **API base URL** and a
**token provider** (the MSAL `acquireToken` thunk from [`31`](./31-auth-migration.md)); token
acquisition is **opaque to the data hooks** — it happens in the HTTP layer, never in query args.

```ts
// src/data/rest-client.ts
import type {
  DataAccess, CreateCaseInput, CreateCaseResult, SuggestedAddress, InspectionDecisionInput,
  SaveInspectionDecisionResult, BoxGates, LocationAssistGate, InboundEmail, InboundFacet,
  InboundCounts, TriageState, InspectionAddressCounts, MergeCasesResult,
} from '@cs/domain';
import type { Case, Evidence, Provider, ActivityEvent } from '@cs/domain';
import type { QueueName, LiveCounts, Throughput, AgingExceptions, PipelineStage, ReasonFacet } from '@cs/domain';
import { BOX_GATES_ALL_FALSE, LOCATION_ASSIST_GATE_ALL_OFF, INBOUND_COUNTS_ZERO } from '@cs/domain';

export interface RestClientOptions {
  /** API origin, e.g. https://cespk-api-dev.azurewebsites.net (Vite env at build time). */
  baseUrl: string;
  /** Returns a fresh Entra access token for the API scope (MSAL acquireTokenSilent). */
  getToken: () => Promise<string>;
}

export function createRestDataAccess(opts: RestClientOptions): DataAccess {
  const base = opts.baseUrl.replace(/\/$/, '');

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await opts.getToken();                 // Bearer injected HERE, not in query args
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 204) return undefined as T;
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text().catch(() => '')}`);
    return (await res.json()) as T;
  }
  const get = <T>(p: string) => call<T>('GET', p);
  const post = <T>(p: string, b?: unknown) => call<T>('POST', p, b);

  // Preserve the interface's "honest off / honest empty" contract: a gate/aggregate
  // read NEVER throws a feature on by accident — it resolves to the all-off baseline.
  const safe = <T>(p: () => Promise<T>, fallback: T) => p().catch(() => fallback);
  const enc = encodeURIComponent;

  return {
    // ----- Cases -----
    caseById: (id) => get<Case | undefined>(`/api/cases/${enc(id)}`),
    createCase: (input: CreateCaseInput) => post<CreateCaseResult>('/api/cases', input),
    casesForQueue: (name) => get<Case[]>(`/api/queues/${enc(name)}/cases`),
    openVrmTwins: (vrm, exclude) =>
      get<Case[]>(`/api/cases?vrm=${enc(vrm)}&open=true${exclude ? `&exclude=${enc(exclude)}` : ''}`),
    setOnHold: (id, onHold) => post<void>(`/api/cases/${enc(id)}/hold`, { onHold }),
    mergeCandidates: (id) => get<Case[]>(`/api/cases/${enc(id)}/merge-candidates`),
    mergeCases: (src, tgt) => post<MergeCasesResult>(`/api/cases/${enc(tgt)}/merge`, { sourceCaseId: src }),

    // ----- Evidence / providers / corpus -----
    imagesForCase: (id) => get<Evidence[]>(`/api/cases/${enc(id)}/images`),
    providers: () => get<Provider[]>('/api/providers'),
    providerByCode: (code) => get<Provider | undefined>(`/api/providers/${enc(code)}`),
    inspectionAddressSuggestions: (id) => safe(() => get<SuggestedAddress[]>(`/api/cases/${enc(id)}/inspection-suggestions`), []),
    inspectionAddressCounts: () => safe(() => get<InspectionAddressCounts>('/api/inspection-addresses/counts'), { confirmed: 0, suggested: 0 }),
    saveInspectionDecision: (id, d: InspectionDecisionInput) =>
      post<SaveInspectionDecisionResult>(`/api/cases/${enc(id)}/inspection-decision`, d),

    // ----- Dashboard aggregates (computed server-side now) -----
    liveCounts: () => get<LiveCounts>('/api/dashboard/live-counts'),
    throughput: () => get<Throughput>('/api/dashboard/throughput'),
    agingExceptions: () => get<AgingExceptions>('/api/dashboard/aging-exceptions'),
    queueCounts: () => get<Record<QueueName, number>>('/api/dashboard/queue-counts'),
    reasonCounts: () => get<ReasonFacet[]>('/api/dashboard/reason-counts'),
    pipelineStages: () => get<PipelineStage[]>('/api/dashboard/pipeline-stages'),

    // ----- Activity -----
    recentActivity: () => get<ActivityEvent[]>('/api/activity'),
    activityForCase: (id) => get<ActivityEvent[]>(`/api/cases/${enc(id)}/activity`),

    // ----- Gate reads (honest-off baselines preserved) -----
    getBoxGates: () => safe(() => get<BoxGates>('/api/gates/box'), { ...BOX_GATES_ALL_FALSE }),
    getBoxFileRequestTemplateId: () => safe(() => get<{ templateId?: string }>('/api/gates/box').then(r => r.templateId), undefined),
    getLocationAssistGate: () => safe(() => get<LocationAssistGate>('/api/gates/location-assist'), { ...LOCATION_ASSIST_GATE_ALL_OFF }),
    getHoldNewCasesDefault: () => safe(() => get<{ value: boolean }>('/api/settings/hold-new-cases').then(r => r.value), false),
    setHoldNewCasesDefault: (value) => call<void>('PUT', '/api/settings/hold-new-cases', { value }),

    // ----- Inbox / triage -----
    inboundEmails: (facet?: InboundFacet) =>
      safe(() => get<InboundEmail[]>(`/api/inbound${facet?.category ? `?category=${enc(facet.category)}${facet.subtype ? `&subtype=${enc(facet.subtype)}` : ''}` : ''}`), []),
    inboundEmailCounts: () => safe(() => get<InboundCounts>('/api/inbound/counts'), { ...INBOUND_COUNTS_ZERO }),
    setTriageState: (id, state: TriageState) => post<void>(`/api/inbound/${enc(id)}/triage`, { state }),
  };
}
```

Notes that keep parity with today's behaviour:
- **`safe(...)` mirrors the existing "honest off / honest empty" defaults** baked into the
  `DataAccess` JSDoc (gates default all-false, suggestions/inbox default `[]`). The interface comments
  in `types.ts` are the contract; preserve them (R3 freezes the contract before this is built).
- The **queue/dashboard windowing math** (Monday-anchored week, DD/MM/YYYY parsing, `statusToQueue`
  membership) that `dataverse-source.ts` did client-side moves to the API (it reuses the same
  `@cs/domain/model` helpers, so the numbers are identical for identical data — D10).
- No `now?: Date` is threaded over the wire — the server uses its own clock; the hooks already call
  these without relying on a client-passed `now` for correctness.

## 3. REWRITE — the three injectable transports (connector → REST)

The pure clients (`parser-client.ts`, `location-assist-client.ts`, `box-transport.ts`) stay; only the
concrete transport injected into them at startup changes from "Power Apps SDK connector op" to "fetch
to the API". Under Power Platform these existed because CSP was `connect-src 'none'` and raw `fetch`
was refused; **off Power Platform the SPA legitimately `fetch`es the API origin** (CORS-allowed), so
the rewrite is a straight HTTP call carrying the same Bearer token.

```ts
// src/data/parser-rest-transport.ts  (replaces parser-connector-transport.ts)
import type { ParseRequest, ParserResponse, ParserTransport } from './parser-client';
export function makeRestParserTransport(call: ApiCall): ParserTransport {
  return async (req: ParseRequest): Promise<ParserResponse> =>
    call<ParserResponse>('POST', '/api/parser/parse', req);   // API proxies the Python parser Function
}
```

`location-assist-rest-transport.ts` and `box-rest-transport.ts` follow the same shape — `POST
/api/location-assist/suggest` and `GET/POST /api/cases/{id}/box/*`. The Box transport keeps the **same seam
status contract** (`ok` / `gated_off` / `folder_not_ready` / `error`); the gate + folder-readiness
decisions move into the API (it reads the app-settings gates + the case's Box folder column), and the
transport just maps the API's JSON status back onto the existing `BoxResult` union. `ApiCall` is the
same authenticated `call` helper from `rest-client.ts` (export it for reuse). The injected
`getToken` thunk is shared, so all four HTTP surfaces carry one consistent Bearer token.

## 4. REMOVE — Power Platform bootstrap & SDK
| Target | Why |
|---|---|
| `src/PowerProvider.tsx` | SDK host bridge → replaced by `MsalProvider` ([`31`](./31-auth-migration.md)) |
| `src/generated/**` | pac-generated Dataverse services (`Cr1bd_*Service`, models) — no analogue off Dataverse |
| `src/data/generated-services.ts` | the SDK-backed bundle (imports `src/generated/`) |
| `power.config.json` | Power Platform deploy manifest |
| `.power/**` | pac bootstrap metadata |
| `vite.config.ts` — `powerApps()` plugin + its import | not needed off Power Platform |
| `package.json` deps `@microsoft/power-apps` (1.0.3), `@microsoft/power-apps-vite` (1.0.2) | SDK + Vite plugin |

`package.json` gains `@azure/msal-browser` + `@azure/msal-react` (see [`31`](./31-auth-migration.md))
and `"@cs/domain": "*"`. Net dependency change: minus the two Power packages, plus the two MSAL
packages and the workspace dep.

**`vite.config.ts` after:**
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],                       // powerApps() removed
  server: { port: 5173, open: false },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

**`main.tsx` after** — `PowerProvider` → `MsalProvider`; `configureDataAccess(generatedServices)` →
`configureDataAccess(createRestDataAccess(...))`; inject the three REST transports. Full wiring is in
[`31` §SPA side](./31-auth-migration.md); the data-seam half:
```tsx
const api = { baseUrl: import.meta.env.VITE_API_BASE_URL as string, getToken: acquireApiToken };
configureDataAccess(createRestDataAccess(api));
configureLocationAssistTransport(makeRestLocationAssistTransport(api));   // was makeConnector…
configureBoxTransports({ /* copyFileRequest, getSharedLink, requestFinalize via REST */ });
// parser transport is injected where ManualIntake calls parseDocument(req, makeRestParserTransport(api))
```
The long Box/location-assist **deploy-wiring comment blocks** in today's `main.tsx` (pac
`add-data-source` + connector binding) are deleted — there are no connectors or env-var tables to wire
anymore; gates are app-settings the API reads.

## 5. Build & deploy (pac → Azure Static Web Apps, Free tier)

Build is unchanged (`tsc -b && vite build` → `dist/`). Only the deploy target changes. Per Microsoft
Learn *"Configure Azure Static Web Apps → Fallback routes"*, an SPA needs a `navigationFallback`
rewrite to `index.html` so client-side routes (`/case/:id`, `/inbox`, …) don't 404 on refresh.

**`mockup-app/staticwebapp.config.json`:**
```json
{
  "navigationFallback": { "rewrite": "/index.html" },
  "globalHeaders": {
    "Content-Security-Policy": "default-src 'self'; connect-src 'self' https://cespk-api-dev.azurewebsites.net https://login.microsoftonline.com; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'"
  }
}
```
> CSP note: off Power Platform the old `connect-src 'none'` server boundary is replaced by an explicit
> allow-list — the API origin + the Entra login authority (MSAL needs it). The "no secret reaches the
> browser" invariant ([`03`](./03-target-architecture.md)) holds because the SPA carries only an Entra
> token; every credential stays server-side. We do **not** use SWA's built-in `routes`/`allowedRoles`
> gate here (that is the SWA EasyAuth path); MSAL is the single auth flow ([`31`](./31-auth-migration.md)).

**Provision + deploy (Microsoft Learn *"Deploy a static web app with Azure Static Web Apps CLI"* + *az staticwebapp secrets list*):**
```bash
# one-time: create the Free SWA (no GitHub integration — manual/CLI deploy)
az staticwebapp create -n cespk-spa-dev -g rg-collisionspike-dev -l westeurope --sku Free
#   (SWA Free is a global service; -l is the metadata/control-plane region. uksouth is not a SWA region — westeurope is the nearest.)

# build
cd mockup-app && npm ci && npm run build               # → mockup-app/dist + staticwebapp.config.json copied to dist root

# deploy dist/ to the Free SWA (token from the CLI, never committed)
TOKEN=$(az staticwebapp secrets list --name cespk-spa-dev -g rg-collisionspike-dev --query "properties.apiKey" -o tsv)
npx -y @azure/static-web-apps-cli deploy ./dist --deployment-token "$TOKEN" --env production
```
Vite **build-time** config (API base URL, Entra client/tenant ids, API scope) is injected via
`VITE_*` env vars — **public values only, never secrets**. Set them in the shell/CI before
`npm run build` (e.g. `VITE_API_BASE_URL`, `VITE_ENTRA_CLIENT_ID`, `VITE_ENTRA_TENANT_ID`,
`VITE_API_SCOPE` — see [`31`](./31-auth-migration.md)). The SWA URL becomes the SPA redirect URI on
the Entra SPA app registration ([`31` §app registrations](./31-auth-migration.md)).

> **Verified on Microsoft Learn:** *Azure Static Web Apps FAQ* — SWA managed identity is "only used to
> retrieve authentication secrets from Key Vault"; for MI/Key Vault references in the API you must
> "bring your own Functions app." That confirms the standalone Function App API (D5) and that the SPA
> hosting itself needs no MI.

## 6. Verify (part of P6)
- `npm run build` succeeds with the two Power packages removed and `@cs/domain` resolved via the
  workspace.
- The existing **vitest** suite (it mocks the seam and exercises `@cs/domain` rules) passes; the
  contract/parity tests that moved into `packages/domain` pass there. Add a `rest-client` test that
  asserts each method hits the frozen endpoint ([`21`](./21-backend-api-build.md)) with a Bearer header.
- Point `rest-client` at the API running locally (`func start` in `api/`) and confirm Dashboard +
  CaseList + CaseDetail render against local Postgres.
- The app loads via the SWA URL behind MSAL sign-in and renders Dashboard + CaseDetail against live
  Postgres; a deep-link refresh (`/case/<id>`) serves the SPA (navigationFallback) rather than 404.
</content>
</invoke>
