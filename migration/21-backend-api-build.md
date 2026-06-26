# 21 — Backend API build (the BFF)

The single biggest new build. Today **Dataverse auto-generates the OData API** the Code App consumes
through connectors. Remove Dataverse and that API vanishes — so we build a **standalone Flex
Consumption Function App** (**TypeScript / Node 20** — D10) that the SPA and the orchestration both
call. **Phase P3.** It owns the logic Dataverse + flows gave for free.

The API is the only component that reads/writes the new **Postgres** system-of-record ([`20`](./20-data-and-schema-migration.md));
the SPA never touches the DB. It also re-evaluates the **shared TS business rules** ([§Reuse](#reuse-the-rules--dont-re-derive-them-d10))
and proxies the six existing **Python** Functions over HTTP.

## Why a standalone Function App (not SWA managed API)
Per Microsoft Learn (*"Static Web Apps — API support with Azure Functions"* + *"Configure your App
Service or Azure Functions app to use Microsoft Entra sign-in"*), SWA **managed** Functions are
HTTP-only, Consumption-only, capped at **45 s**, and have **no managed identity and no Key Vault
references**. The API needs a Postgres connection, KV-referenced secrets, a managed identity, and Entra
token validation → it must be a **standalone Function App** (matching the six already deployed). The SPA
reaches it by URL + Bearer token (CORS allows the SWA origin). See **D5** in
[`02`](./02-decisions-and-open-questions.md).

---

## The contract — mirror `DataAccess` exactly (R3: FREEZE before P4/P5)
The interface lives at `mockup-app/src/data/types.ts` (`export interface DataAccess`, ~line 373) — **29
methods**. Every method becomes one HTTP endpoint. The frontend's new `rest-client.ts`
([`30`](./30-frontend-preservation.md)) implements `DataAccess` 1:1 by calling these. All routes are
prefixed `/api` (the Functions host default). Request/response **shapes are the shared types** below
(`@cs/domain`, [§Reuse](#reuse-the-rules--dont-re-derive-them-d10)), so the SPA and API import the same
TypeScript — no hand-kept wire schema.

**Conventions.** `{id}`/`{caseId}` are Case GUIDs (Postgres `uuid`). `now?` (the windowing clock the
mock/dashboard aggregates accept) is passed as `?now=<ISO-8601>`; absent ⇒ server `now()`. Dates in the
domain payloads stay **DD/MM/YYYY strings** (unchanged from the mock types) — only the `now` *query*
param is ISO. All reads require a valid token (any role); writes require the role in the **Authz**
column ([`31`](./31-auth-migration.md)). "Honest-off / honest-empty" methods (the gate reads, the
not-yet-wired corpus/inbox seams) **resolve 200 with the all-false / `[]` / zero default on any
failure** — never 5xx — so the UI degrades exactly as today (the defaults `BOX_GATES_ALL_FALSE`,
`LOCATION_ASSIST_GATE_ALL_OFF`, `INBOUND_COUNTS_ZERO` are exported from the shared types and returned
verbatim).

### 21.1 Full endpoint map (all 29 `DataAccess` methods)

| # | `DataAccess` method | HTTP | Route | Request | 200 response (shared type) | Authz |
|---|---|---|---|---|---|---|
| **Cases** |
| 1 | `caseById(id)` | GET | `/api/cases/{id}` | — | `Case` (404 if absent → SPA maps to `undefined`) | User |
| 2 | `createCase(input)` | POST | `/api/cases` | `CreateCaseInput` (JSON body) | `201` `CreateCaseResult` (`{ id }`) | User |
| 3 | `casesForQueue(name, now?)` | GET | `/api/queues/{name}/cases?now=` | `name` ∈ `not-ready│review│held` | `Case[]` (server windows `done`/today) | User |
| 4 | `openVrmTwins(vrm, exclude?)` | GET | `/api/cases?vrm={vrm}&open=true&exclude={id}` | query | `Case[]` (open, same VRM, ≠ exclude) | User |
| 5 | `setOnHold(id, onHold)` | POST | `/api/cases/{id}/hold` | `{ onHold: boolean }` | `204` (void) | User |
| 6 | `mergeCandidates(id)` | GET | `/api/cases/{id}/merge-candidates` | — | `Case[]` (open, same provider, non-terminal, non-merged) | User |
| 7 | `mergeCases(src, tgt)` | POST | `/api/cases/{tgt}/merge` | `{ sourceCaseId: string }` (`{tgt}` = target) | `MergeCasesResult` (`{ targetCaseId, movedEvidence }`) | User |
| **Evidence** |
| 8 | `imagesForCase(id)` | GET | `/api/cases/{id}/images` | — | `Evidence[]` (image-kind, non-excluded) | User |
| **Providers (corpus)** |
| 9 | `providers()` | GET | `/api/providers` | — | `Provider[]` | User |
| 10 | `providerByCode(code)` | GET | `/api/providers/{code}` | `code` = principalCode | `Provider` (404 → `undefined`) | User |
| **Inspection-address (corpus)** |
| 11 | `inspectionAddressSuggestions(id)` | GET | `/api/cases/{id}/inspection-suggestions` | — | `SuggestedAddress[]` (honest `[]`) | User |
| 12 | `inspectionAddressCounts()` | GET | `/api/inspection-addresses/counts` | — | `InspectionAddressCounts` (`{ confirmed, suggested }`) | User |
| 13 | `saveInspectionDecision(id, d)` | POST | `/api/cases/{id}/inspection-decision` | `InspectionDecisionInput` | `SaveInspectionDecisionResult` (`{ persisted, id? }`) | User |
| **Dashboard / queue aggregates** |
| 14 | `liveCounts(now?)` | GET | `/api/dashboard/live-counts?now=` | query | `LiveCounts` (`{ notReady, review, held }`) | User |
| 15 | `throughput(now?)` | GET | `/api/dashboard/throughput?now=` | query | `Throughput` | User |
| 16 | `agingExceptions(now?)` | GET | `/api/dashboard/aging-exceptions?now=` | query | `AgingExceptions` (rows oldest-due-first + tallies) | User |
| 17 | `queueCounts(now?)` | GET | `/api/dashboard/queue-counts?now=` | query | `Record<QueueName, number>` | User |
| 18 | `reasonCounts(now?)` | GET | `/api/dashboard/reason-counts?now=` | query | `ReasonFacet[]` (zero-count dropped) | User |
| 19 | `pipelineStages()` | GET | `/api/dashboard/pipeline-stages` | — | `PipelineStage[]` | User |
| **Activity feed** |
| 20 | `recentActivity()` | GET | `/api/activity` | — | `ActivityEvent[]` (newest first) | User |
| 21 | `activityForCase(id)` | GET | `/api/cases/{id}/activity` | — | `ActivityEvent[]` (newest first) | User |
| **Box gates** |
| 22 | `getBoxGates()` | GET | `/api/gates/box` | — | `BoxGates` (honest `BOX_GATES_ALL_FALSE`) | User |
| 23 | `getBoxFileRequestTemplateId()` | GET | `/api/gates/box/file-request-template` | — | `{ templateId: string \| null }` → SPA maps `null`→`undefined` | User |
| **Location-assist gate** |
| 24 | `getLocationAssistGate()` | GET | `/api/gates/location-assist` | — | `LocationAssistGate` (honest `…_ALL_OFF`) | User |
| **App intake preferences** |
| 25 | `getHoldNewCasesDefault()` | GET | `/api/settings/hold-new-cases` | — | `{ value: boolean }` (false on failure) | User |
| 26 | `setHoldNewCasesDefault(v)` | PUT | `/api/settings/hold-new-cases` | `{ value: boolean }` | `204` (void) | **Admin** |
| **Inbox / Triage (Phase 8)** |
| 27 | `inboundEmails(facet?)` | GET | `/api/inbound?category=&subtype=` | query (`InboundFacet`) | `InboundEmail[]` (`receivedOn desc`, honest `[]`) | User |
| 28 | `inboundEmailCounts()` | GET | `/api/inbound/counts` | — | `InboundCounts` (honest `INBOUND_COUNTS_ZERO`) | User |
| 29 | `setTriageState(id, state)` | POST | `/api/inbound/{id}/triage` | `{ state: TriageState }` | `204` (void) | User |

> **Why the verbs/shapes above are not free choices.** `void` returns (5, 26, 29) → `204 No Content`.
> `createCase` is a creation → `201 Created` carrying only the new id (mirrors `CreateCaseResult`,
> which is the GUID the SPA navigates to). Reads that the mock resolves to `undefined` (1, 10) → `404`
> the rest-client converts back to `undefined`; the SPA must not treat a 404 here as an error. The
> "honest" reads (11, 12, 22–25, 27, 28) **never** 4xx/5xx on a soft failure — they 200 with the
> documented default, preserving the seam's degradation behaviour the vitest suite asserts.

### 21.2 Gate reads in the new world (methods 22–25)
The gate reads no longer query the Dataverse `environmentvariable*` platform tables (those rows are
gone). Instead:
- **Read-only gates** (`BOX_*`, `LOCATION_ASSIST_*`, `AZURE_MAPS_ENABLED`) come from **app-settings**
  via the centralised `gates` module ([`10`](./10-settings-migration.md) §1.4) — `process.env.BOX_API_ENABLED === 'true'`.
- **`getBoxGates`** assembles `BoxGates` from those settings; `fileRequestTemplateConfigured` is
  **derived** (`BOX_FILE_REQUEST_TEMPLATE_ID` non-empty), exactly as the interface comment specifies.
- **`getBoxFileRequestTemplateId`** returns the raw `BOX_FILE_REQUEST_TEMPLATE_ID` string (or `null`).
- **`getLocationAssistGate`** ANDs `LOCATION_ASSIST_ENABLED` + `AZURE_MAPS_ENABLED` + `LOCATION_ASSIST_API_BASE`
  non-empty into `enabled` (the only flag the UI gates on).
- **`hold-new-cases`** (25/26) is the **one runtime-writable gate** — it reads/writes the DB
  `app_setting` row, not an app-setting ([`10`](./10-settings-migration.md) §1.3). The write (26) is
  **Admin-only**, preserving the Dataverse "env-var customization privilege" rule.

Every gate read **defaults to all-false / honest-off on any failure** (wrap the read; never let a
missing setting 500). The defaults are the shared constants `BOX_GATES_ALL_FALSE`,
`LOCATION_ASSIST_GATE_ALL_OFF`.

### 21.3 Auxiliary (non-`DataAccess`) routes the rewritten transports call
Three frontend transports that today hit Power Platform connectors are replaced by REST calls to the
API ([`30`](./30-frontend-preservation.md)); the API proxies the corresponding **Python** Function:
- `POST /api/location-assist/suggest` → `cespk*`/location-suggest Function (Vision + Maps), gated by
  `getLocationAssistGate`. Feeds the reviewer-invoked assist (returns `SuggestedAddress[]` with
  `source:'assist'`).
- `POST /api/parser/parse` → `cespike-parser-dev-x7xt3d5ovhi7y`, gated by `PDF_MAPPER_ENABLED`.
- `GET /api/gates/box` already covers the Box gate read; the Box **byte/link** ops stay in the
  `box-webhook` Function path (orchestration, [`22`](./22-orchestration-migration.md)).

These are **not** part of the frozen `DataAccess` contract — they are the BFF proxy surface. Keep them
under distinct route prefixes so the `DataAccess` freeze (R3) is unaffected.

---

## Logic the API now owns (was Dataverse + flows)
All four reuse the **shared TS rules** (no re-derivation):

1. **Status state machine** — call `statusForReviewCase` from `@cs/domain` (`contracts/case-status.ts`)
   on every write that can change a Case's field/evidence/identity state (`createCase`, evidence
   accept/exclude, field edits, `mergeCases`). Enforce the **terminal-lock** (`eva_submitted`,
   `box_synced`, `error` are never recomputed) and the FIX-3 evidence-aware tree exactly as the
   contract encodes it. Persist the computed `cr1bd_casestatus` integer (codes preserved,
   [`10`](./10-settings-migration.md) §2.1). On any change, write a `status_changed` audit row (code
   `100000013`).
2. **Dedup** — ADR-0010 reference-disambiguated, human-confirmed. The hard backstop is the Postgres
   `UNIQUE (source_message_id)` constraint ([`10`](./10-settings-migration.md) §4 / [`20`](./20-data-and-schema-migration.md)).
   The API applies the **soft ladder** via `resolveCase` (`@cs/domain/dedup.ts`) where it is on a hot
   path: `openVrmTwins` (surfaces bare-VRM twins → `duplicate_risk` proposal, **never** auto-merge),
   `mergeCandidates`/`mergeCases` (same-provider only — assert `workProviderId` equality; reparent
   evidence; mark source `linked_to_instruction`/`caseType merged`; record survivor in
   `duplicatekeys`; recompute target readiness). The bulk intake-time dedup runs in orchestration
   ([`22`](./22-orchestration-migration.md)); the two INVIOLABLE rules (never auto-merge on VRM+time;
   never link across providers) are enforced in the shared `resolveCase`, so API and orchestration
   share one implementation.
3. **Audit** — write one append-only row per state change to the `audit_event` table, using the
   controlled **`auditaction` vocabulary (27 codes, `100000000`–`100000026`, integers preserved** —
   [`10`](./10-settings-migration.md) §2.1; the older "11 action codes" figure is stale). Mirror the
   Dataverse invariants ([`31`](./31-auth-migration.md), [`10`](./10-settings-migration.md) §5): the
   API's DB role has **no `UPDATE`** on `audit_event` (tamper-evidence), `INSERT`/`SELECT` for both app
   roles, `DELETE` **Admin-only** (retention cascade). `cr1bd_name` = one-line summary,
   `cr1bd_occurredat` = sort key, optional `before`/`after` JSON snapshot.
4. **EVA readiness** — reuse `validateEvaImageRules` (`@cs/domain/image-rules.ts`: ≥2 accepted images,
   ≥1 `overview` with `registrationVisible`, ≥1 `damage_closeup`) + the required-field check from
   `case-status.ts`. The drag-drop payload uses `buildEvaJson`/`buildEvaPayload`
   (`@cs/domain/eva-export.ts`) so the API, the SPA, and the (unchanged) Python `evavalidation` Function
   stay byte-identical. Readiness is **derived, never stored** as a separate truth — it is whatever the
   shared functions compute over the persisted rows.
5. **Authz** — validate the Entra JWT on every request and enforce `CollisionSpike.User` / `.Admin`
   (next section + [`31`](./31-auth-migration.md)); optionally set the Postgres RLS role per request
   from the validated claim so the DB enforces the same boundary ([`20`](./20-data-and-schema-migration.md) §2,
   [`10`](./10-settings-migration.md) §5).

---

## Entra JWT validation + app-role authz (API side)
Azure Functions provides **no built-in token validation for Node** — App Service Authentication's
client-identity injection is **.NET-only** (Learn: *"Azure Functions HTTP trigger — working with client
identities"*), and even where Easy Auth front-gates the app it **does not validate app roles** (Learn:
*"Configure your App Service or Azure Functions app to use Microsoft Entra sign-in"* → *"App Service
authentication doesn't perform this validation; within the target app code you can validate that the
token has the expected roles"*). So the API validates the JWT **in code** with `jose` against the tenant
JWKS, then reads the `roles` claim — exactly the pattern Learn documents (the `roles` array carries the
assigned app roles).

```ts
// src/lib/auth.ts
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

const TENANT = process.env.ENTRA_TENANT_ID!;                 // app-setting (not secret)
const API_AUDIENCE = process.env.API_AUDIENCE!;              // e.g. 'api://<data-api-client-id>'
const ISSUER = `https://login.microsoftonline.com/${TENANT}/v2.0`;
const JWKS = createRemoteJWKSet(
  new URL(`https://login.microsoftonline.com/${TENANT}/discovery/v2.0/keys`),
);

export type AppRole = 'CollisionSpike.User' | 'CollisionSpike.Admin';

export async function authenticate(req: HttpRequest): Promise<JWTPayload> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Missing bearer token');
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: ISSUER,
    audience: API_AUDIENCE,            // reject tokens minted for other resources
  });                                   // signature + iss + aud + exp/nbf checked here
  return payload;
}

/** Wrap a handler with auth + required app role. Admin implies User (supersetOf). */
export function withRole(
  required: AppRole,
  handler: (req: HttpRequest, ctx: InvocationContext, claims: JWTPayload) => Promise<HttpResponseInit>,
) {
  return async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const claims = await authenticate(req);
      const roles = (claims.roles as string[] | undefined) ?? [];
      const ok = roles.includes(required)
        || (required === 'CollisionSpike.User' && roles.includes('CollisionSpike.Admin'));
      if (!ok) return { status: 403, jsonBody: { error: 'forbidden' } };
      return await handler(req, ctx, claims);
    } catch (e) {
      if (e instanceof HttpError) return { status: e.status, jsonBody: { error: e.message } };
      ctx.error(e);
      return { status: 500, jsonBody: { error: 'internal' } };
    }
  };
}
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
```

- `ENTRA_TENANT_ID` + `API_AUDIENCE` are **non-secret app-settings** (the SPA client id, tenant id, and
  API scope live in Vite build env — never a secret in the bundle, [`11`](./11-secrets-and-keyvault.md)).
- The three Entra app registrations + the `roles` claim are owned by [`31`](./31-auth-migration.md);
  this file owns only the **server-side check**.
- All function `app.http(...)` registrations set `authLevel: 'anonymous'` (we do our own auth) — do
  **not** rely on Function keys for staff auth; the bearer token is the gate. (Function-key auth is kept
  only for the server-to-server proxy hops to the Python Functions, [§Build](#build--deploy).)

---

## Reuse the rules — don't re-derive them (D10)
The pure domain/contract logic in `mockup-app/src/contracts/` and `mockup-app/src/domain/`
(classification, provider-match, address-policy, image-rules, case-status, eva-export, dedup) is
**platform-neutral, framework-free, deterministic TypeScript** — and the **frontend keeps using it**. So
the API (and the orchestration, [`22`](./22-orchestration-migration.md)) are **TypeScript** and import
the **same code**, instead of porting it to Python and maintaining two divergent copies forever.

### Shared workspace package — `@cs/domain`
Convert the repo to an **npm workspace** (one root manifest — the single workspace tooling for the whole
repo, chosen because `mockup-app` already uses npm and plans [`30`](./30-frontend-preservation.md) /
[`99`](./99-cutover-and-validation.md) use `npm ci` / `npm test`; no separate pnpm/yarn lockfile). The
canonical sub-directory layout is **`contracts / domain / model / dto / codecs`** — identical to plan
[`30` §0](./30-frontend-preservation.md), so there is exactly one blueprint for `packages/domain/src`.

```
collisionspike/
  package.json                   # root: { "private": true, "workspaces": ["packages/*","mockup-app","api","orchestration"] }
  packages/
    domain/                      # @cs/domain  (the ONE source of truth for the rules + the wire DTOs)
      package.json               # name '@cs/domain'; "type":"module"; exports MAP: "."→src/index.ts, "./codecs"→src/codecs/index.ts, "./gates"→src/gates.ts (subpaths kept OUT of the main barrel; consumers build via project refs)
      tsconfig.json              # composite: true (project references); declaration: true
      src/
        contracts/               # MOVED verbatim from mockup-app/src/contracts (non-test .ts + parity tests)
          case-status.ts
          image-rules.ts
          eva-export.ts
        domain/                  # MOVED verbatim from mockup-app/src/domain
          classification.ts
          provider-match.ts
          address-policy.ts
          dedup.ts
          index.ts
        model/                   # pure domain TYPES + pure helpers lifted from mock/ (type-only at runtime cost)
          # Case, Evidence, Provider, EvaFields, ActivityEvent (from mock/types.ts);
          # QueueName, LiveCounts, Throughput, AgingExceptions, PipelineStage, ReasonFacet (from mock/queues.ts);
          # statusToQueue, dueInfo, suggestCasePo, QUEUES, REASON_LABELS, … (pure helpers)
        dto/                     # the seam DTOs lifted from data/types.ts (NO cr1bd_* record shapes):
          # DataAccess + every input/result type — CreateCaseInput/Result, InspectionDecisionInput,
          # SaveInspectionDecisionResult, SuggestedAddress, InspectionAddressCounts,
          # BoxGates(+BOX_GATES_ALL_FALSE), LocationAssistGate(+LOCATION_ASSIST_GATE_ALL_OFF),
          # MergeCasesResult, InboundEmail/Facet/Counts(+INBOUND_COUNTS_ZERO), the string unions
        codecs/                  # adapter.ts choice-codec + DD/MM/YYYY logic — the API imports these (R4)
          # makeChoiceCodec + the dataverse/choicesets/*.json imports (server-side enum↔int↔string)
        gates.ts                 # the SHARED gate reader (process.env, server-only) — imported as @cs/domain/gates by BOTH the API (lib/gates.ts re-exports it) and the orchestration (plan 22 §B). Deliberately NOT in the barrel below, so the browser SPA never pulls process.env code; the SPA reads gate values over HTTP via /api/gates/* instead (plan 10 §1.4).
        index.ts                 # barrel: re-export contracts + domain + model + dto (codecs + gates are subpath-only, NOT re-exported here)
  mockup-app/                    # SPA — depends on @cs/domain ("@cs/domain": "*")
  api/                           # THIS plan — Function App, depends on @cs/domain
  orchestration/                 # plan 22 — depends on @cs/domain
```

**What moves, precisely** (the move table in [`30` §0](./30-frontend-preservation.md) is authoritative; summarised here):
- **`contracts/*.ts` + `domain/*.ts`** (the **rules**) move **verbatim** into `contracts/` + `domain/` —
  same code, only the file location and the import specifier change. This is the D10 core.
- **The pure domain types + helpers** — `Case`/`Evidence`/`Provider`/`EvaFields`/`ActivityEvent` (today in
  `mockup-app/src/mock/types.ts`) and the queue/dashboard result types + pure helpers
  (`mockup-app/src/mock/queues.ts`: `QueueName`, `LiveCounts`, `Throughput`, …, `statusToQueue`,
  `suggestCasePo`) — move into **`model/`**. The **fixture rows** (`mock/cases.ts` etc.) stay in the SPA.
- **The seam DTOs** — the `DataAccess` interface + its input/result types from
  `mockup-app/src/data/types.ts` — move into **`dto/`**, so the API and the SPA's `rest-client` share
  **one** definition of every request/response shape. The **`GeneratedServices`/`*Record` (`cr1bd_*`)
  half of `data/types.ts` is NOT moved** — those model the Dataverse OData services and are **deleted**
  with the rest of the Power Platform seam ([`30`](./30-frontend-preservation.md)).
- **The choice codecs** — `mockup-app/src/data/adapter.ts` (the choiceset enum↔int↔string codec +
  DD/MM/YYYY date logic) moves into **`codecs/`**. The **API** imports `codecs/` from its
  `src/lib/mappers.ts` to map Postgres rows ↔ EVA integer codes ↔ domain enum strings (R4 — choiceset
  integers preserved, [`10`](./10-settings-migration.md) §2.1); the **client no longer imports them**.
  The DB row ↔ domain mapping itself is the API's `src/lib/mappers.ts` against the Postgres schema
  ([`20`](./20-data-and-schema-migration.md)), using these codecs — not the deleted connector shapes.

**Reconciliation with [`30`](./30-frontend-preservation.md):** plan 30 lists `contracts/**` + `domain/**`
under *KEEP as-is*. That stays true of the **code** (zero logic change) — only the **location** changes
(they move to `packages/domain/src/**` and the SPA imports `@cs/domain`). The parity tests
(`*.parity.test.ts`, `*.test.ts`) move alongside their subjects so the suite keeps guarding the rules in
their new home. Update `mockup-app`'s relative imports (`../contracts/…`, `../domain/…`,
`../mock/types`) to `@cs/domain` — a mechanical re-point, no behavioural change; the vitest suite proves
it.

### The language boundary is just HTTP
- The existing **6 Python Functions** (parser, enrichment, evasentry, evavalidation, box-webhook,
  location-suggest) + the OCR ACA container **stay Python, untouched** — they don't touch these rules;
  they're standalone compute/integration.
- The API calls them over HTTP with a **Function key** (or managed identity where the target supports
  it), exactly as the flows did via connectors — see [§Build](#build--deploy) and
  [`11`](./11-secrets-and-keyvault.md).

---

## API project structure (Node 20, Functions v4 + programming-model v4)
Per Learn (*"Azure Functions Node.js developer guide (nodejs-model-v4)"* + *"Migrate to v4 of the
Node.js programming model"*): functions are registered in code via `app.http(...)`; the only files
required at the project root are `host.json` and `package.json`; the `main` field globs the compiled
entry files; the handler signature is `(request: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>`
with the **request first**.

```
api/                              # @cs/api — the Data API Function App
  host.json                       # extensionBundle [4.*, 5.0.0); functionTimeout if needed
  package.json                    # "main": "dist/src/{index.js,functions/*.js}"
  tsconfig.json                   # references ../packages/domain
  local.settings.json             # gitignored — local env (conn string, tenant, audience)
  .funcignore                     # exclude src/, node_modules dev deps from publish
  src/
    index.ts                      # app-level setup; imports './functions/*' for side-effect registration
    functions/
      cases.ts                    # app.http for routes 1–7, 8, 20–21 (case-scoped)
      providers.ts                # 9–10
      inspection.ts               # 11–13
      dashboard.ts                # 14–19
      gates.ts                    # 22–24
      settings.ts                 # 25–26
      inbound.ts                  # 27–29
      proxy.ts                    # §21.3 auxiliary parser/location-assist routes
    lib/
      auth.ts                     # jose JWKS validation + withRole (above)
      db.ts                       # pg Pool; conn string from KV ref / MI token
      mappers.ts                  # Postgres row <-> @cs/domain model/dto types, via @cs/domain/codecs (choice int <-> enum)
      audit.ts                    # writeAudit(action, caseId, summary, severity, before?, after?)
      gates.ts                    # thin re-export of @cs/domain/gates (the SHARED gate reader, plan 10 §1.4) — the SAME module the orchestration imports via @cs/domain/gates
      functions-client.ts         # typed fetch to the 6 Python Functions (key/MI)
  package deps: @azure/functions, @cs/domain ("*" — npm workspace), pg, jose
```

Each route is one registration, e.g.:
```ts
// src/functions/inspection.ts
import { app } from '@azure/functions';
import { withRole } from '../lib/auth';
import { saveInspectionDecision } from '../lib/inspection';   // calls @cs/domain + db

app.http('saveInspectionDecision', {
  methods: ['POST'],
  authLevel: 'anonymous',                                     // we validate the bearer token ourselves
  route: 'cases/{id}/inspection-decision',
  handler: withRole('CollisionSpike.User', async (req, ctx) => {
    const caseId = req.params.id;
    const body = await req.json();                            // InspectionDecisionInput
    const result = await saveInspectionDecision(caseId, body);
    return { status: 200, jsonBody: result };                // SaveInspectionDecisionResult
  }),
});
```

---

## Build & deploy
**Provision (one-time).** Flex Consumption + Node 20, in the existing RG/region (Learn: *"Create and
manage function apps in the Flex Consumption plan"*). Confirm region/runtime support first — UK South
must appear in the flex location list:

```bash
RG=rg-collisionspike-dev
API=cespk-api-dev                 # globally-unique Function App name
STG=cespkapistdev01               # dedicated GP storage for the app (Standard_LRS, no public blob)

# 0. verify flex supports node 20 in the region BEFORE creating
az functionapp list-flexconsumption-locations --query "sort_by(@,&name)[].{Region:name}" -o table
az functionapp list-flexconsumption-runtimes --location uksouth --runtime node --query "[].version" -o tsv

# 1. dedicated storage (Functions needs its own AzureWebJobsStorage)
az storage account create -n "$STG" -g "$RG" -l uksouth --sku Standard_LRS --allow-blob-public-access false

# 2. create the Flex Consumption app (NO --functions-version: Flex is always v4)
az functionapp create -g "$RG" -n "$API" --storage-account "$STG" \
  --flexconsumption-location uksouth --runtime node --runtime-version 20
```

**Identity, secrets, CORS, gates.**
```bash
# managed identity -> Key Vault Secrets User (plan 11) for the Postgres secret (if password auth)
az functionapp identity assign -g "$RG" -n "$API"
# Postgres conn string app-setting (prefer Entra/MI auth -> no secret at all; else a KV reference):
az functionapp config appsettings set -g "$RG" -n "$API" --settings \
  PGHOST=... PGDATABASE=collisionspike PGUSER=... PGSSLMODE=require \
  PGPASSWORD='@Microsoft.KeyVault(SecretUri=https://cespk-pg-kv-dev.vault.azure.net/secrets/pg-admin-password/)' \
  ENTRA_TENANT_ID=<tenant-guid> API_AUDIENCE='api://<data-api-client-id>'
# the 20 gates + 6 config strings (plan 10 §1.2) on this app too
# allow the SWA origin (plan 30)
az functionapp cors add -g "$RG" -n "$API" --allowed-origins https://<swa-name>.azurestaticapps.net
```

**Local dev + publish** (Core Tools v4 — Learn: *"Develop Azure Functions locally by using Core Tools
(TypeScript)"* + *func init / func new / func azure functionapp publish*):
```bash
# scaffold (once): TypeScript + v4 programming model
func init api --worker-runtime typescript --model V4
func new --template "HTTP trigger" --name caseById      # then refactor into the structure above
# install the whole workspace once from the repo root (npm workspaces — one root package.json,
# one lockfile; resolves @cs/domain via the workspace symlink):
npm install                                             # at collisionspike/ root
# build the shared package + the api (project references), then run locally against local/remote Postgres;
# rest-client (plan 30) points here for the P3 gate
npm run build --workspace @cs/domain --workspace @cs/api
cd api && func start
# deploy (TypeScript: build first, then publish the compiled output)
npm run build --workspace @cs/api && func azure functionapp publish "$API"
```

---

## Done-when (P3 gate)
The existing `mockup-app` **vitest** suite — which mocks the seam — passes against a `rest-client`
pointed at this API running locally (`func start`), with `@cs/domain` resolved from the workspace; **all
29 endpoints in §21.1 respond with the shared-type shapes**; the auth wrapper rejects anonymous (401)
and an Admin-only write (26) for a User token (403); and the **contract mapping in §21.1 is frozen** (R3)
before P4/P5 begin.
