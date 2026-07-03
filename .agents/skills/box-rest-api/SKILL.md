---
name: box-rest-api
description: Box REST API reference for the collisionspike Box-centric intake pivot — CCG service-identity auth (token minted inside an Azure Function, never the connector), the custom-connector operation contract (CreateFolder, CopyFileRequest, GetSharedLink file+folder, ListFolder, CreateWebhook + webhook & File-Request lifecycle), webhook signatures/limits, and the three recurring cross-platform patterns (CCG-token-in-Function + api_key-on-connection, the HMAC webhook-receiver order, server-minted shared links under connect-src 'none'). Use when building or validating the Box custom connector OpenAPI, the CCG token-mint or box-webhook receiver Function, or when you need the exact Box endpoint/scope/limit/auth shape. Authoritative op names + verified-vs-unverified facts come from 00-BUILD-PLAN.md; re-read automationsresearch/box/markdown + developer.box.com for field-level depth. Pairs with the box-integration-architect and azure-integration-engineer agents.
---

# Box REST API (collisionspike Box-centric pivot)

Authoritative source of truth (in order): the **00-BUILD-PLAN reconciliation table + verified-vs-
unverified roll-up** (`box-integration-pivot/plans/00-BUILD-PLAN.md`, the unified op-name row) → the
dossier `box-integration-pivot/01-box-capabilities-verified.md` → the local Box mirror
`../../../../../research/automationsresearch/box/markdown` + **developer.box.com** for
field-level depth. The four section plans diverged on op names / connection-ref — **do not re-import
them**; this skill + the build plan are the contract.

## Auth (CCG service identity)
- **`POST https://api.box.com/oauth2/token`**, `grant_type=client_credentials`,
  `box_subject_type=enterprise`, `box_subject_id=<Enterprise ID>`, `client_id` + `client_secret`.
  **App Access Only.** Scopes: **`root_readwrite`** (files/folders/metadata/file-requests/shared-links)
  + **`manage_webhook`**.
- **Minted INSIDE the Azure Function, NOT the connector** — a custom Power Platform connector cannot
  run the OAuth2 client-credentials grant (verified, Microsoft Learn). The connector authenticates by
  **API-key (an Azure Function host key) on the connection**; the Function exchanges the CCG token from
  a Key Vault `client_secret`. This is the proven EVA-Sentry / parser facade pattern.
- `client_secret` + webhook signature keys are **Key Vault references only** — never on the connection,
  never echoed.

## Operations (UNIFIED operationIds — the generated `*Service` method names MUST equal these)
| operationId | REST | Notes |
|---|---|---|
| `CreateFolder` | `POST /2.0/folders` | `name=@toUpper(casePo)`, parent = archive root. **409 `item_name_in_use`** (case-insensitive) → treat as idempotent success. |
| `CopyFileRequest` | `POST /2.0/file_requests/{templateId}/copy` | The **only** "create" — copy-from-template only; one File Request per folder; the reg field is baked into the template. `status:"active"`, optional `expires_at`. |
| `GetSharedLink` | `PUT /2.0/files/{id}?fields=shared_link` | The **file** variant. Server-minted only. |
| `GetFolderSharedLink` | `PUT /2.0/folders/{id}?fields=shared_link` | The **folder** variant — the one "Open in Box" surfaces (and the one an iframe embed, not pursued here, would need). Both variants are provisioned as **two operationIds** (file vs folder); the `*Service` method names are `GetSharedLink` + `GetFolderSharedLink` respectively. |
| `ListFolder` | `GET /2.0/folders/{id}/items` | The op for the reconciliation sweep — a **deferred, not-yet-built** backstop (Box's retry on the receiver's non-2xx is the primary recovery). |
| `CreateWebhook` | `POST /2.0/webhooks` | `target` = file\|folder, `triggers:["FILE.UPLOADED"]`. |
| webhook lifecycle | `GET` / `DELETE /2.0/webhooks/{id}` | |
| File-Request lifecycle | `GET` / `PUT` (status active\|inactive) / `DELETE /2.0/file_requests/{id}` | |

Field-level request/response depth → `references/endpoints.md`.

## Webhook semantics + signatures
Best-effort: **no SLA, at-least-once, droppable, also fires on MOVE**, retries up to ~12×/2h. The
receiver **processes the Dataverse fan-out ON the request path** and **responds by outcome** — `200`
when SETTLED, a non-2xx (`503`) on a TRANSIENT failure so **Box retries** (Box does NOT retry after a
2xx). Signature: `BOX-SIGNATURE-PRIMARY` / `BOX-SIGNATURE-SECONDARY` = **HMAC-SHA256** over
`body ++ BOX-DELIVERY-TIMESTAMP`; **10-min replay** window; **dual-key** rotation; **timing-safe**
compare. In-process `BOX-DELIVERY-ID` dedup is a best-effort fast-path; the **durable** dedup is the
Evidence-existence check on the `box:file:<id>` tag in `cr1bd_sourcemessageid`. Full receiver step order
→ `references/webhook-receiver.md`.

## The three cross-platform patterns
1. **CCG-token-in-Function facade + `api_key` (Function host key) on the connection.** The
   `apiProperties.json` MUST declare `connectionParameters.api_key` — an `apiKey` securityDefinition
   alone does **not** create the param (proven for `cr1bd_ceparser`). Pass base64 bodies as a **plain
   string**, never `format:byte`.
2. **The webhook-receiver order:** replay → HMAC → parse + in-process dedup fast-path →
   **PROCESS on the request path** (`FILE.UPLOADED`-vs-`FILE.MOVED` disambiguation → resolve case →
   durable Evidence-existence dedup on the `box:file:<id>` tag → write Evidence (storagePath stays Blob;
   write `cr1bd_boxfileid` + `cr1bd_acceptedforeva=true`) → idempotent `CS Status Evaluate` re-invoke) →
   respond `200` when SETTLED, non-2xx (`503`) on a transient failure so Box retries.
3. **`connect-src 'none'` → server-mint shared links.** The Code App calls Box only via the
   connector/flows, never `fetch()`. Evidence is surfaced as a **server-minted "Open in Box" deep link**
   (the operator decision is **link, not embed**). An iframe embed would need a `frame-src` (NOT
   `frame-ancestors`) edit — the embed option has been formally dropped.

## VERIFIED vs UNVERIFIED (carry honestly)
- **CONFIRMED:** 10-min replay; HMAC-SHA256 dual-key; retries up to ~12×/2h; folder-scoped
  `FILE.UPLOADED` (fires on move); Business Plus = the metadata-field gate; CCG `box_subject_type=
  enterprise` + App Access Only; custom-connector-cannot-do-CCG; 409-on-duplicate-target.
- **UNVERIFIED (do NOT assert):** the **~60-min token / no refresh** (re-mint per cycle is safe
  regardless); the **~1000/app-user webhook ceiling** (live ref 404'd; only 409-on-duplicate-target is
  confirmed); the **"2xx within 30s"** ceiling (confirm at build). The **File-Request→`FILE.UPLOADED`**
  firing is **undocumented — LIVE-TEST it** (fallback = the `ListFolder`/Metadata-Query sweep).

## The one unpinned decision (surface, don't assert)
The **connection-reference identity is NOT settled**: plan 04 prefers a parallel
`shared_box_rest`/`cr1bd_box_rest` (keeping first-party `shared_box` for `finalize-eva-box`'s
`CreateFile` byte path); plan 03 repoints `cr1bd_box` in place; 00-BUILD-PLAN = "Pin one." Reference it
via a **placeholder** until Wave 0 pins it.

## Plan floor (precise)
The floor is **base Box Business** (~$15/user/mo) — it covers **folders + File Requests + webhooks +
CCG** (Wave 0/1). **Business Plus** (~$25–33/user/mo) is needed **only** for the deferred **reg-capture
metadata FIELD on the File-Request form** (Wave 2 / Phase C — an optional later reliability upgrade).
Do not call Business Plus the floor; reserve "Business Plus" for the metadata tier. (See
`box-integration-pivot/09-metadata-role.md`.)

## Boundary
This is the **REST / contract** reference. It does **not** own the Power Automate definition fragments
(→ **box-flow-patterns**) or the React / connector-binding side (→ **code-app-architect** + plan 02).
It **does** own the `connect-src 'none'` → server-mint + `frame-src` rule (a Box-REST consequence the
azure agent reads). Do not restate the **EVA 12-field contract** (`eva-sentry-api` owns that) — only the
Box archival coupling (the **UPPERCASE Case/PO folder**) is in scope. Depth lives in `references/`:
`endpoints.md`, `webhook-receiver.md`, `filerequest-and-metadata.md`.
