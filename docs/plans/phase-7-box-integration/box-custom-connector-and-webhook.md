# Box custom connector + token-mint/webhook Function — BUILD spec

> The **build-artefact spec** for the Box-side unlock (B0). It defines the **contract** the azure
> section implements; it does **not** author the connector OpenAPI, the Functions, the flows, or the
> schema (those are owned across the seam — see Ownership). Ground truth, in order: ADR-0012 →
> [`box-integration-pivot/plans/00-BUILD-PLAN.md`](../../../box-integration-pivot/plans/00-BUILD-PLAN.md)
> reconciliation table → the local Box mirror (`automationsresearch/box/markdown`) + developer.box.com.
> The skills [`box-rest-api`](../../../.claude/skills/box-rest-api/SKILL.md) and
> [`box-flow-patterns`](../../../.claude/skills/box-flow-patterns/SKILL.md) carry the field-level depth.

## Ownership (the seam)

- **Azure section (azure-integration-engineer) OWNS the build:** the custom connector OpenAPI 2.0 +
  `apiProperties.json`, the CCG token-mint module, the `box-webhook` receiver Function, its bicep, the
  Key Vault wiring, and the `cr1bd_box` connection rewrite. It implements **this contract**.
- **This phase (Box contract keeper) OWNS the shape:** scopes, endpoints, limits, the unified op-name
  list, the webhook semantics + signature order, the shared-link policy, and the tier/residency calls.
- **Flows section** authors every flow that BINDS the connector. **Dataverse section** owns the `BOX_*`
  gate/column/audit-action schema. **Code-app-architect** owns the UI binding. The webhook **receiver is
  an Azure Function, not a flow.** Bytes stay first-party (`finalize-eva-box`'s `CreateFile`); the custom
  connector creates the **folder** only.

## A. The custom Box REST connector

### Auth posture (load-bearing)

- The connector authenticates by a **single `apiKey` securityDefinition** carrying the **Azure Function
  host key** (`x-functions-key`, header) — identical to `functions/parser/openapi/parser-connector.json`.
  **No OAuth2/client-credentials security definition** appears in the document: Power Platform custom
  connectors **cannot** run the client-credentials grant (Learn, verbatim), and adding it makes the
  connector pick the wrong/blank flow.
- The `apiProperties.json` **MUST** declare `connectionParameters.api_key` — an `apiKey`
  securityDefinition alone does **not** create the connection parameter (proven for `cr1bd_ceparser`).
  The function key lives **on the connection**.
- The connector's routes are thin Function endpoints; the Function injects the live Box **bearer** token
  server-side (Part B). The Box **`client_secret` is a Function-side Key Vault reference — never on the
  connection, never in the OpenAPI document, never echoed.**
- For any base64 body, pass a **plain string**, never `format:byte` (the parser double-encode lesson).

### Service identity + scopes (Box-side)

- Auth flow: `POST https://api.box.com/oauth2/token`, `grant_type=client_credentials`,
  `box_subject_type=enterprise`, `box_subject_id=<Enterprise ID>`, `client_id` + `client_secret`.
  **App Access Only** (authenticates as the Service Account).
- Scopes: **`root_readwrite`** (folders/files/metadata/file-requests/shared-links) + **`manage_webhook`**
  (webhook subscriptions). Re-authorize in the Admin Console on **any** scope change.

### Operations (UNIFIED operationIds — the generated `*Service` method names MUST equal these)

| operationId | REST | Request shape (key fields) | Notes |
|---|---|---|---|
| `CreateFolder` | `POST /2.0/folders` | `{ name, parent:{ id } }` | `name=@toUpper(casePo)`; parent = archive root. **409 `item_name_in_use`** (case-insensitive) → treat as idempotent success (return the existing id). |
| `CopyFileRequest` | `POST /2.0/file_requests/{templateId}/copy` | `{ folder:{ id, type:"folder" }, status:"active", expires_at? }` | The **only** "create" — copy-from-template only; one File Request per folder; capture-form fields baked into the template. Response carries the live upload `url`. |
| `GetSharedLink` | `PUT /2.0/files/{id}?fields=shared_link` | `{ shared_link:{ access, password?, unshared_at?, permissions } }` | The **file** variant. Server-minted only. `unshared_at` (expiry) is paid-account only. |
| `GetFolderSharedLink` | `PUT /2.0/folders/{id}?fields=shared_link` | `{ shared_link:{ access, password?, unshared_at?, permissions } }` | The **folder** variant — backs "Open in Box". Provisioned as a **second operationId** (file vs folder are two ops; one operationId cannot cover both paths). `unshared_at` (expiry) is paid-account only. |
| `ListFolder` | `GET /2.0/folders/{id}/items` | path `{id}` | The reconciliation sweep (the webhook fallback). |
| `CreateWebhook` | `POST /2.0/webhooks` | `{ target:{ id, type }, address, triggers:["FILE.UPLOADED"] }` | `target.type` = file\|folder; scope `manage_webhook`. 409 on a duplicate target+app+user. |
| webhook lifecycle | `GET` / `DELETE /2.0/webhooks/{id}` | path `{id}` | Renewal/deactivation. |
| File-Request lifecycle | `GET` / `PUT` / `DELETE /2.0/file_requests/{id}` | `PUT { status:"active"\|"inactive" }` | Deactivate (`inactive`) makes the link 404 without deleting history. |

> **Shared-link policy:** mint **server-side** only (the Code App is under `connect-src 'none'`).
> Evidence is surfaced as the **"Open in Box" deep link** (the folder shared link) — **linked, not
> embedded**. No iframe is built; `BOX_EMBED_ENABLED` stays reserved/off; **no `frame-src` edit** is part
> of this build.

### Connection reference

Add a **parallel `cr1bd_box_rest`** connection reference for the custom connector (PINNED — build-plan
reconciliation table + `flows/connection-references.json`; **NOT** an in-place repoint of `cr1bd_box`,
which is RETAINED first-party for `finalize-eva-box`'s `CreateFile` byte path): `tier:"Premium"`,
`custom:true`, `boundAtActivation:true`, `operationIds` = the unified list above. Recommend **Premium** so it shares a DLP data group with the
other custom service connectors (all connectors in one flow must share a data group or import fails).
Note on the entry: "service identity = Box Service Account (CCG); Function host key on the connection;
Box `client_secret` is a Function-side KV ref, never here."

### Limits / backoff (carry the verified-vs-unverified split)

- **CONFIRMED:** `CreateFolder` 409 case-insensitive; duplicate-webhook 409 (target+app+user).
- **UNVERIFIED — confirm at build, do not assert:** the **per-app/user webhook ceiling** (cited ~1000;
  live ref 404'd) → prefer a **single archive-root or per-repeat-sender webhook over per-case**; the
  **~60-min CCG token / no refresh** → the Function re-mints per cycle regardless; Box **rate limits**
  (~1000/min/user; the connector window ~100 calls/conn/60s) → exponential backoff on `429`.

## B. The token-mint + webhook-receiver Azure Function

A new **`functions/box-webhook/` FC1 app** (the FC1-clone pattern; `cespkeva-fn-ufa3ci` is **not** in the
live registry — record the chosen name in `live-environment.md` at deploy). One app carries two surfaces:

### B.1 — CCG token-mint / facade

- A shared module mints the Service-Account token: `POST https://api.box.com/oauth2/token`
  (`grant_type=client_credentials`, `client_id`, `client_secret` from Key Vault,
  `box_subject_type=enterprise`, `box_subject_id=<enterpriseId>` — a non-secret app-setting).
- Cache the token for ~its lifetime; **refresh on 401**; **exponential backoff on 429**. Re-minting per
  cycle is safe (the ~60-min/no-refresh detail is unverified but the re-mint covers it).
- This is **App Access Only** — the app must be **Admin-Console authorized** (operator step) before the
  first call succeeds (`unauthorized_client` otherwise — which is exactly why the free test account can't
  use this path).

### B.2 — Webhook receiver (the order matters)

HTTP trigger, `authLevel=function` (the host-key second gate), route e.g. `POST /api/box-webhook`,
public HTTPS (reputable-CA cert, TLS 1.2/1.3; **not** a `*.box.com` URL). Logic **in this order**:

1. **Replay reject** — read `BOX-DELIVERY-TIMESTAMP`; reject if older than **10 minutes**.
2. **Signature verify** — compute HMAC-**SHA256** over **body-bytes ++ timestamp-bytes** with the
   **primary** key, then the **secondary** key; accept if **either** matches via a **timing-safe**
   compare (supports Box key rotation); else `403`.
3. **Respond 2xx promptly, then work** — Box retries on delivery failure (up to ~12×/2h), so the handler
   must be idempotent. _(Do **not** hard-code a "within N seconds" ceiling — respond promptly and confirm
   the exact limit against Box's webhook docs at build time.)_
4. **Dedup** on `BOX-DELIVERY-ID` (at-least-once delivery; the append-only audit row is **not** a dedup
   key — dedup before the Evidence write, or key Evidence on a `cr1bd_boxfileid`/source-event-id; confirm
   the choice with the schema work).
5. **Disambiguate** `FILE.UPLOADED` from `FILE.MOVED` (the trigger fires on both; a move carries source
   context).
6. **Resolve the case** — Box folder id → `cr1bd_boxfolderid` → Case (state this lookup explicitly in the
   handler).
7. **Write Evidence** (the byte **storagePath stays Blob**) and **re-invoke the idempotent
   `CS Status Evaluate`** so the case advances. For the B3 drop-box path, reg-merge (ADR-0010) the upload
   to an open instruction case; **unmatched → Held** (don't guess).

### B.3 — bicep (`functions/box-webhook/infra/main.bicep`)

Clone the FC1 pattern (`functions/enrichment/infra/main.bicep`): Linux Flex Consumption (`FC1`,
`instanceMemoryMB:512` is sufficient), identity-based deployment storage (`allowSharedKeyAccess:false`,
`AzureWebJobsStorage__accountName`, `authentication.type:SystemAssignedIdentity`), `minTlsVersion:'1.2'`,
`httpsOnly:true`, Log Analytics (`PerGB2018`, 30-day) + workspace-based App Insights. System-assigned MI
granted **Key Vault Secrets User** (`4633458b-17de-408a-b874-0445c86b69e6`) + **Storage Blob Data Owner**
(`b7e6dc6d-f1e8-4753-8033-0f276bb0955b`). App-settings: `BOX_API_BASE`, `BOX_ENTERPRISE_ID`,
`BOX_API_ENABLED` (gate, default `false`), and three KV refs (`@Microsoft.KeyVault(SecretUri=…)`):
**`BOX_CLIENT_SECRET`**, **`BOX_WEBHOOK_PRIMARY_KEY`**, **`BOX_WEBHOOK_SECONDARY_KEY`** — declared as
references only, never literals. **No `api.box.com` CORS rule** (server-to-server; no browser preflight).

## C. The `finalize-eva-box` rewrite contract (spec only — flows section authors the definition)

- The folder is created **once** at parse-confirm via the custom connector `CreateFolder` (B1), so
  finalize **augments** an existing folder — **remove** any fictional in-flow `CreateFolder`/`folderId`.
- Keep the **S2 content-bind**: for **each** accepted Evidence image, `GetFileContentByPath_V2` on
  `cr1bd_evidenceblob` to get **real bytes**, then first-party `CreateFile`
  (`folderPath=concat('/',toUpper(casepo))`) — never pass the path string; never the custom connector for
  bytes.
- Preserve the **2-previews-then-all** photo order and the non-image pass; keep the `EVA_API_ENABLED`
  gate (drag-drop vs Sentry REST).
- Migrate the hard-coded `BoxArchiveRootId` flow parameter to read `cr1bd_BOX_FOLDER_ROOT_ID`.
- **Stamp `cr1bd_status=box_synced` (100000009) LAST** — the existing idempotency latch, unchanged.
- Linter: extend `BOX_ID_LITERAL_RE` to flag hard-coded `parent_id|folder_id|file_request_id` literals
  (NOT `name:"<digits>"` — the folder name is the UPPERCASE Case/PO); assert `shared_box_rest` (custom
  connector) ops never appear in finalize's byte path; allow `box-blob-purge`'s status+boxsyncedat
  `ListRecords` as a documented exception.

## Offline verification (the only check this layer runs)

- `az bicep build` on `functions/box-webhook/infra/main.bicep` → green.
- The connector OpenAPI is **2.0**, < 1 MB, single `apiKey` sec def, `connectionParameters.api_key`
  present, operationIds = the unified list.
- `node flows/validate-flows.mjs` → `OK` for the flows that bind the connector (well-formed JSON;
  declared connection refs only; each `BOX_*`-gated flow registered with its gate; balanced
  `@`-expression parens).

## Boundary (do not cross here)

This spec defines the **contract**. It does not author the OpenAPI JSON, the Python Functions, the flow
definitions, the `BOX_*` schema, or the Code App binding — those live across the seam (Ownership, above).
It does **not** restate the EVA 12-field contract (that is `eva-sentry-api`'s) — only the Box archival
coupling (the **UPPERCASE Case/PO folder**) is in scope. It does **not** introduce an iframe / `frame-src`
edit — evidence is **linked, not embedded** (ADR-0012).
