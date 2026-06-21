# Azure / cloud infrastructure — build plan

## Overview

This is the **Azure/cloud unlock** for the Box-centric intake pivot: the layer that lets every other
section reach Box at all. It is **additive** to the live FC1 Function estate and the existing
feature-gate pattern — nothing here re-platforms or touches the relational core (Dataverse stays the
system of record; Box is a one-way content mirror). Three buildable artefacts do the work: (1) a
**custom Box REST Power Platform connector** authenticated by an **API-key on the connection**
(Power Platform custom connectors **cannot** run the OAuth2 client-credentials grant — verified
Microsoft Learn — so the **Box CCG service-identity token exchange lives inside the Function/connector
backend**, never in the connector security definition); (2) a **Box webhook-receiver Azure Function**
(FC1, HTTP trigger `authLevel=function`, mandatory `BOX-SIGNATURE-PRIMARY/SECONDARY` HMAC-SHA256
verification + 10-minute replay window, idempotent Dataverse write); (3) a **Key Vault secret** for
the Box `client_secret` resolved by the Function's system-assigned managed identity. Plus a
**status-driven Blob-purge** design (a flow-driven delete on `box_synced` + grace, **not** a blind
lifecycle age rule — lifecycle policies cannot read Dataverse case-status). Everything is authored and
`az bicep build` / lint-able **offline**; the Box Platform app, its `client_secret`, the Admin-Console
authorization, and the `frame-src` CSP edit stay **operator-gated**. Claude never holds a Box credential.

## Current state (what exists today, with file/resource paths)

- **FC1 Function pattern (the template to clone)** —
  `functions/enrichment/infra/main.bicep` is the canonical "Function + Storage + Log Analytics +
  App Insights + Key Vault + system-assigned MI" shape: Linux Flex Consumption (`FC1`/`FlexConsumption`),
  identity-based deployment storage (`allowSharedKeyAccess:false`, `AzureWebJobsStorage__accountName`,
  `authentication.type:SystemAssignedIdentity`), `minimumTlsVersion TLS1_2`, `httpsOnly:true`,
  app-settings KV references `@Microsoft.KeyVault(SecretUri=…)`, MI granted **Key Vault Secrets User**
  (`4633458b-17de-408a-b874-0445c86b69e6`) + **Storage Blob Data Owner**
  (`b7e6dc6d-f1e8-4753-8033-0f276bb0955b`). `functions/addressmatch/infra/main.bicep` is the same
  shape **without** a Key Vault (no-secrets variant) — the closest analogue for the webhook Function's
  M1 surface (no per-instance secret *except* the HMAC key, which is the one KV ref we add).
- **Custom-connector pattern (the template to clone)** —
  `functions/parser/openapi/parser-connector.json`: OpenAPI **2.0**, single `securityDefinitions`
  entry `apiKey` in header (`x-functions-key`), `security: [{apiKeyHeader:[]}]`, the key stored
  **on the connection** never in the document. This is exactly the auth model the Box connector uses
  (the Function host key gates the connector → backend; the **Box** secret never appears in the
  connector).
- **Connection-reference manifest** — `flows/connection-references.json`. Already declares
  `cr1bd_box` but **wrongly** points at the first-party `shared_box` (Standard, file-only,
  interactive-OAuth, no folder/webhook/metadata/file-request/shared-link ops). The note already
  records "a custom connector is the only service-identity escalation". This entry is **repointed**
  by this plan.
- **Live Functions (4)** — parser `cespike-parser-dev-x7xt3d5ovhi7y`, enrichment `cespkenrich-fn-gi62sd`,
  addressmatch `cespkaddr-fn-i7m4re`, evavalidation `cespkeval-fn-6c6fxd` — all FC1, registry in
  `docs/architecture/live-environment.md`. (OCR `cespkocr` on Azure Container Apps is host-pending and
  is **out of scope** for this section.)
- **Evidence byte store** — Azure Blob account `cespkevidstdev01`, container `evidence`; written by
  `CS Classify+Persist`; read by `finalize-eva-box` via `GetFileContentByPath_V2` on
  `cr1bd_evidenceblob` (access-key auth). `finalize-eva-box.definition.json` still contains a
  **fictional `CreateFolder`** action (no such op on the first-party connector) and the S2 content-bind
  fix (read real bytes before each `CreateFile`) is in code but not flow-integrated.
- **Existing gate convention** — Dataverse env-vars (`EVA_API_ENABLED`, `ENRICHMENT_ENABLED`, …),
  flows READ them, never write. The Dataverse section plan
  (`box-integration-pivot/plans/05-dataverse.md`) owns adding the 5 `BOX_*` gates +
  `BOX_WEBHOOK_SECRET_NAME` + the 3 Box columns on `cr1bd_case`; this section **consumes** those names.
- **Operator-gated boundary** — `docs/gated.md` items 4–5 (EVA switch-on, Box connection binding);
  `AGENTS.md` (azure-integration-engineer owns Functions/KV/connectors). Memory
  `live-services-boundary`: Claude wires offline, operator owns secrets/consent/live-confirm.

## Changes — ordered build steps

> Ordering rationale: the **secret + Key Vault** (1) and the **connector definition** (2) and the
> **webhook Function** (3–5) are the unlock and can be built in parallel offline; the **flow rewrites**
> (8–10) depend on the connector being importable; the **purge** (11) and **docs** (12–14) are last.
> Owner tags: **[Claude-buildable]** = authored/linted offline; **[operator-gated]** = needs a Box/Entra
> credential, an Admin consent, a live confirm, or a tenant CSP change Claude must not perform.

1. **Author the Key Vault secret *reference* for the Box client_secret (no value).** In the new
   webhook Function bicep (step 5) declare a KV `standard` vault with `enableRbacAuthorization:true`
   (clone `functions/enrichment/infra/main.bicep` lines 118–141), and an app-setting
   `BOX_CLIENT_SECRET = @Microsoft.KeyVault(SecretUri=${vaultUri}secrets/${boxClientSecretName})`
   where `boxClientSecretName` defaults to `box-client-secret`. The template declares **only the
   reference** — never a literal secret. Also wire `BOX_WEBHOOK_PRIMARY_KEY` /
   `BOX_WEBHOOK_SECONDARY_KEY` as KV refs (the HMAC signature keys Box generates per webhook).
   · owner **[Claude-buildable]** (the bicep) · depends-on: nothing
   · verify: https://learn.microsoft.com/azure/app-service/app-service-key-vault-references#understand-source-app-settings-from-key-vault
   (`@Microsoft.KeyVault(SecretUri=…)` form, resolved by system-assigned MI with **Key Vault Secrets User**)

2. **Author the custom Box REST connector OpenAPI 2.0 document** at
   `functions/box-webhook/openapi/box-connector.json`. Security: a **single `apiKey` securityDefinition**
   carrying the Function host key (`x-functions-key`, header) — identical to the parser connector;
   the connector calls the Function backend, which performs the Box CCG exchange. **Do not** put an
   OAuth2/client-credentials security definition in the document — Power Platform custom-connector
   creation explicitly rejects client-credentials and would pick the wrong/blank flow. Operations
   (each a thin Function route that injects the Box bearer server-side):
   `CreateFolder` → `POST /2.0/folders` (`{name, parent:{id}}`);
   `CopyFileRequest` → `POST /file_requests/{file_request_id}/copy` (`{folder:{id,type:"folder"}, status, expires_at?, title?}`);
   `UpdateSharedLink` → `PUT /2.0/files/{file_id}?fields=shared_link` (`{shared_link:{access}}`) and the folder variant;
   `CreateWebhook` → `POST /2.0/webhooks` (`{target:{id,type}, address, triggers:["FILE.UPLOADED"]}`);
   `GetFolderItems` → `GET /2.0/folders/{folder_id}/items` (reconciliation sweep);
   `SetMetadata`/`GetMetadata` → `*/metadata/enterprise/{templateKey}` (reg field). `document` params
   follow the parser's "**plain string, never `format:byte`**" rule for any base64 body.
   · owner **[Claude-buildable]** · depends-on: 5 (the Function routes exist to back each op)
   · verify (OpenAPI 2.0 + no client-creds in sec def): https://learn.microsoft.com/connectors/custom-connectors/define-openapi-definition#prerequisites
   · verify (CCG not supported in connector): https://learn.microsoft.com/connectors/custom-connectors/faq#requirements

3. **Implement the Box CCG token exchange inside the Function backend.** A shared module mints the
   Service-Account token: `POST https://api.box.com/oauth2/token` with
   `grant_type=client_credentials`, `client_id`, `client_secret` (KV), `box_subject_type=enterprise`,
   `box_subject_id=<enterpriseId>` (a non-secret app-setting). Cache the token for its ~lifetime,
   refresh on 401; apply exponential backoff on Box `429`. This is **App Access Only** (Service
   Account); the app must be **authorized in the Box Admin Console** (operator step 13) before the
   first call succeeds.
   · owner **[Claude-buildable]** (the code; the secret value + Admin authorization are operator)
   · depends-on: 1, 13 · verify: https://developer.box.com/guides/authentication/client-credentials/
   (`grant_type=client_credentials`, `box_subject_type=enterprise`, "authorized for use with your enterprise")

4. **Implement the webhook-receiver handler** in `functions/box-webhook/` (Python v2, HTTP trigger,
   `auth_level=func.AuthLevel.FUNCTION`, route e.g. `POST /api/box-webhook`). Logic, in order:
   (a) read `BOX-DELIVERY-TIMESTAMP`; reject if older than **10 minutes**;
   (b) compute HMAC-**SHA256** over **payload-body-bytes ++ timestamp-bytes** with the **primary** key,
   then the **secondary** key; accept if **either** matches using a **timing-safe** comparison
   (supports Box key rotation); else `403`;
   (c) respond **2xx within 30 s**, *then* do the work (Box retries up to 12× over 2 h, so the handler
   must be **idempotent** — dedup on `BOX-DELIVERY-ID` / Box event id);
   (d) for `FILE.UPLOADED`, **disambiguate upload vs move** (the event also fires on `FILE.MOVED`; a
   move carries source context) and either write a `cr1bd_evidence` row or copy bytes back to Blob for
   the parser/EVA path, then re-invoke `CS Status Evaluate` (idempotent).
   · owner **[Claude-buildable]** · depends-on: 1, 3
   · verify (HTTP trigger `authLevel=function` + `x-functions-key`): https://learn.microsoft.com/azure/azure-functions/functions-bindings-http-webhook-trigger#usage
   · verify (signature alg + body+timestamp + 10-min window + dual key + timing-safe): https://developer.box.com/guides/webhooks/handle/setup-signatures/
   · verify (retry 12× / 2 h, 2xx within 30 s): https://developer.box.com/reference/post-folders/ → (delivery note) https://developer.box.com/guides/webhooks/

5. **Author `functions/box-webhook/infra/main.bicep`** by cloning the FC1 pattern:
   Storage (`Standard_LRS`, identity-based, `allowSharedKeyAccess:false`, TLS1_2, no public blob) +
   Log Analytics (`PerGB2018`, 30-day) + workspace-based App Insights + `FC1` plan
   (`instanceMemoryMB:512` is sufficient) + Linux/Python Function App with **system-assigned MI**,
   `httpsOnly:true`, `minTlsVersion:'1.2'`. App-settings: `AzureWebJobsStorage__accountName`,
   `APPLICATIONINSIGHTS_CONNECTION_STRING`, `BOX_API_BASE`, `BOX_ENTERPRISE_ID`, the three KV refs
   from step 1, and `BOX_API_ENABLED` (gate, default `false`). RBAC: MI → **Key Vault Secrets User**
   on the vault + **Storage Blob Data Owner** on its own deploy storage. (CORS for `https://api.box.com`
   is **not** required — Box→Function is server-to-server, not a browser preflight; only add
   `az functionapp cors` later if a browser ever calls it. See Risks.)
   · owner **[Claude-buildable]** (bicep authored + `az bicep build`; **deploy is operator/login**)
   · depends-on: nothing · verify (FC1 identity storage): https://learn.microsoft.com/azure/azure-functions/flex-consumption-how-to#configure-deployment-settings
   · verify (FC1 IaC + `allowSharedKeyAccess:false` MI): https://learn.microsoft.com/azure/azure-functions/functions-infrastructure-as-code#create-storage-account

6. **Add the `cr1bd_box` connection-reference rewrite to `flows/connection-references.json`.** Change
   `connector`/`apiId` to the custom connector (`shared_box_ccg_jwt` →
   `/providers/Microsoft.PowerApps/apis/shared_box_ccg_jwt`), set `tier:"Premium"`, `custom:true`,
   `operationIds:[…]`, `openapi:"functions/box-webhook/openapi/box-connector.json"`,
   `boundAtActivation:true`, and a note: "service-identity = Box Service Account (CCG); Function host
   key on the connection; Box client_secret is a Function-side KV ref, never here; [RESERVED-FOR-USER]
   to import + bind". Recommend **Premium** tier so it sits in the same DLP data group as the other
   custom service connectors (Microsoft connector classification is metadata-only; **all connectors in
   one flow must share a DLP data group** or import fails).
   · owner **[Claude-buildable]** · depends-on: 2
   · verify (custom-connector tier/DLP coexistence): https://learn.microsoft.com/power-platform/admin/advanced-connector-policies

7. **Register the 5 Box env-var gates as consumed** (the Dataverse section *creates* them; this
   section asserts the names the Function + flows read): `BOX_API_ENABLED`,
   `BOX_FOLDER_AT_INTAKE_ENABLED`, `BOX_FILEREQUEST_ENABLED`, `BOX_EMBED_ENABLED` (all Boolean,
   `false`) + `BOX_WEBHOOK_SECRET_NAME` (String, `box-client-secret`). The Function reads
   `BOX_API_ENABLED` from app-settings (mirrors `ENRICHMENT_ENABLED`); flows read the Dataverse
   env-vars.
   · owner **[Claude-buildable]** (cross-check only; values flipped by operator)
   · depends-on: `plans/05-dataverse.md` step 1 · verify: file `box-integration-pivot/plans/05-dataverse.md`

8. **Rewrite `finalize-eva-box.definition.json` to the real connector contract.** Remove the fictional
   `CreateFolder`; create the folder via the custom connector `CreateFolder` op
   (`POST /2.0/folders`, name = **UPPERCASE Case/PO**) **once** at case-create/parse-confirm (step 9),
   so finalize *augments* an existing folder. Keep the S2 content-bind: for **each** Evidence image
   call `GetFileContentByPath_V2` on `cr1bd_evidenceblob` to get **real bytes**, then upload (never
   pass the path string). Preserve the EVA photo-order loop and the `EVA_API_ENABLED` gate.
   · owner **[Claude-buildable]** (flow JSON; live edit/run is operator) · depends-on: 2, 6
   · verify (folder create shape + 409 case-insensitive collision): https://developer.box.com/reference/post-folders/

9. **Author the `box-folder-at-intake` flow fragment** (gated `BOX_FOLDER_AT_INTAKE_ENABLED`):
   on case-create OR parse-confirm, `CreateFolder` with the UPPERCASE Case/PO name under the archive
   root, capture `folder_id` into `cr1bd_case` (the Dataverse Box column). Handle the **timing
   wrinkle**: prefer **mint-at-parse-confirm** (seconds later, principal known — simplest, matches
   today) over provisional-then-rename. Box folder names are **case-insensitive** → keep exactly **one
   UPPERCASE** folder (a lowercase sibling 409s `item_name_in_use`); treat 409 as "already exists →
   reuse id".
   · owner **[Claude-buildable]** · depends-on: 2, 6, 7
   · verify: https://developer.box.com/reference/post-folders/ (409 `item_name_in_use`, case-insensitive)

10. **Author the `box-filerequest-copy` flow fragment** (gated `BOX_FILEREQUEST_ENABLED`): job-sheet
    "copy chaser" button → `CopyFileRequest` = `POST /file_requests/{templateId}/copy` with
    `folder:{id:<caseFolderId>, type:"folder"}`, `status:"active"`, optional `expires_at`; return the
    live upload `url` to clipboard/email. The **template** (with the required `vehicle_registration`
    metadata field) is hand-built once by the operator (step 13); its `file_request_id` is a flow
    parameter, never hardcoded.
    · owner **[Claude-buildable]** (the flow; template build + id are operator) · depends-on: 2, 6, 9
    · verify (copy endpoint + folder body): https://developer.box.com/reference/post-file-requests-id-copy/

11. **Design the status-driven Blob purge (flow-driven, not a blind lifecycle age rule).** Azure Blob
    **Lifecycle Management** can only filter by **age / prefix / blob-index-tag** — it **cannot** read
    Dataverse `case_status=box_synced`. Two-part design: (a) when `finalize-eva-box` sets status
    `box_synced`, also stamp the blob with an index tag `status=box_synced` (`x-ms-tags` on write, or
    `Set Blob Tags`); (b) a scheduled "Blob purge" flow (or lifecycle rule keyed on the tag **plus** a
    grace age) deletes blobs where `status=box_synced` **AND** age > grace (default 30 d, configurable).
    Prefer the **flow-driven delete** as primary (it can re-check Dataverse `box_synced` is still true
    and never strands a not-yet-mirrored case); a tag-filtered lifecycle rule is the cheap backstop.
    Note: with Storage **soft-delete** enabled, lifecycle/flow deletes go to soft-deleted state for the
    retention window (recoverable).
    · owner **[Claude-buildable]** (the rule JSON + the flow) · depends-on: 8 (writes the tag/timestamp)
    · verify (lifecycle = age/prefix/index-tag only, no joins): https://learn.microsoft.com/azure/storage/blobs/lifecycle-management-policy-delete
    · verify (blobIndexMatch filter): https://learn.microsoft.com/azure/storage/blobs/storage-manage-find-blobs#platform-integrations-with-blob-index-tags

12. **Document the Box Platform-app + Entra/Admin-Console boundary in DEPLOY-RUNBOOK + AGENTS.md.**
    Operator pre-reqs (a playbook section): create a **Platform app (Server Authentication / CCG)** in
    the Box Developer Console; set scopes (see step 13); **authorize it in the Admin Console**
    (Platform → Server Authentication Apps → Add by Client ID); capture **Client ID + Client Secret**;
    inject the secret into Key Vault as `box-client-secret` (and the per-webhook primary/secondary
    signature keys). Re-authorize on any scope change. AGENTS.md: operator owns Platform app + secret +
    Admin consent; Claude owns connector def + Functions + flows.
    · owner **[Claude-buildable]** (the docs) — the steps they describe are **[operator-gated]**
    · verify (Admin authorization by Client ID): file `automationsresearch/box/markdown/552-platform-apps.md`
    · verify (reauthorize after app-settings change): https://developer.box.com/guides/authentication/client-credentials/

13. **[operator-gated] Box Platform app registration, scopes, Admin authorization, secret injection,
    File-Request template build.** Create the CCG app with scopes **`root_readwrite`** (folders/files/
    metadata/file-requests/shared-links) **+ `manage_webhook`** (webhook subscriptions); authorize in
    the Admin Console; supply `client_secret` to Key Vault; hand-build the **template File Request**
    with the required `vehicle_registration` metadata field (needs **Business Plus**) and record its
    `file_request_id`. **Live-test gate:** confirm empirically that a File-Request upload fires
    `FILE.UPLOADED` on the target folder (it is inferred, not documented end-to-end) before B2 is
    relied upon; fallback = timed `GetFolderItems`/Metadata-Query poll.
    · owner **[operator-gated]** · depends-on: 12
    · verify (manage_webhook scope): https://developer.box.com/reference/post-webhooks/
    · verify (File Request needs Business plan + metadata fields): file `automationsresearch/box/markdown/315-about-box-file-request.md`

14. **[operator-gated] CSP `frame-src` edit for the optional Box Embed iframe (B4 only).** The Code App
    CSP default is **`connect-src 'none'`** (so the UI must call Box only via flows/connectors — never
    raw fetch) and **`frame-src 'self'`**. To embed the Box folder via the Box Embed widget, the
    operator adds the Box origin (e.g. `https://app.box.com`) to **`frame-src`** via PPAC
    (Environment → Settings → Privacy + Security → Content security policy → **App** tab) or the REST
    setting **`PowerApps_CSPConfigCodeApps`**. (Note: this is **`frame-src`** — who *this app* may
    embed — **not** `frame-ancestors`, which is who may embed this app. The EXPLORE/dossier references
    to `frame-ancestors` for embedding are the wrong directive.) Shared link minted server-side by the
    `UpdateSharedLink` op (step 2). The lower-touch alternative is "Open in Box" deep-links (no CSP
    change). Gated `BOX_EMBED_ENABLED`.
    · owner **[operator-gated]** (the tenant CSP change) — Claude documents it
    · verify (Code Apps CSP, `connect-src 'none'`, `frame-src 'self'`, App tab, `PowerApps_CSPConfigCodeApps`): https://learn.microsoft.com/power-apps/developer/code-apps/how-to/content-security-policy

## Cross-section dependencies

**Provides to the other sections:**
- **→ Connector/flows section:** the importable custom Box connector (`functions/box-webhook/openapi/box-connector.json`)
  + the repointed `cr1bd_box` connection-reference — every Box flow op binds to this. Without it the
  finalize rewrite, folder-at-intake, and File-Request flows cannot run.
- **→ Dataverse section:** consumes the **5 `BOX_*` gates + `BOX_WEBHOOK_SECRET_NAME`** and the **3 Box
  columns on `cr1bd_case`** (folder_id / file_request_id+url) that `plans/05-dataverse.md` creates;
  the webhook handler **writes** `cr1bd_evidence` rows and re-invokes status-evaluate (idempotent).
- **→ Code App / UI section:** the **server-minted shared link** (`UpdateSharedLink`) for "Open in Box"
  deep-links or the B4 iframe; the UI must reach Box **only** through flows/connectors
  (`connect-src 'none'`).
- **→ EVA section:** the corrected `finalize-eva-box` (real bytes from Blob, folder augment not create)
  preserves the EVA photo-order submit; Box archival stays in unison with EVA finalize.

**Needs from the other sections:**
- **From Dataverse:** the `BOX_*` env-vars + `cr1bd_case` Box columns + `box_synced` status
  (`cr1bd_casestatus` = 100000009 already exists) + the audit-action options for Box folder/
  File-Request/webhook events.
- **From the flows section:** `CS Status Evaluate` must remain **idempotent** (the webhook re-invokes it).
- **From the operator:** the Box Platform app + `client_secret` + Admin authorization + signature keys
  + File-Request template id + the `frame-src` CSP change + the FILE.UPLOADED live-test confirmation.

## Risks & open questions

- **FILE.UPLOADED from a File-Request upload is unproven** (Box documents folder-upload firing and the
  upload landing in the folder, but never closes the File-Request→event loop). *Mitigation:* live-test
  before relying on B2; fallback to a timed `GetFolderItems`/Metadata-Query reconciliation sweep. **(blocking for B2)**
- **Webhooks are best-effort** — no latency SLA, at-least-once, no ordering, droppable
  (permission-blocked / expired session), and `FILE.UPLOADED` **also fires on moves**. *Mitigation:*
  HMAC verification + `BOX-DELIVERY-ID` dedup + idempotent status re-evaluate + periodic reconciliation
  sweep so a missed/duplicate event can't strand or double-process a case.
- **Webhook count ceiling** — Box documents a per-user/per-application webhook limit (the dossier/EXPLORE
  cite ~1000); the live reference page 404'd during verification. *Action:* one webhook per **case
  folder** could approach a ceiling at scale — **confirm the exact limit at build-time** and prefer a
  **single webhook on the archive-root** (recursive) or per-repeat-sender drop-box over per-case
  subscriptions. **(open — verify number)**
- **Burst scaling / Box rate-limit** — batch File-Request uploads can fan out events; Box throttles
  (~1,000/min/user) and the connector ~100/conn/60 s. *Open question:* if queuing risk emerges, front
  the webhook Function with a Storage Queue / Service Bus before the Dataverse writes (durable buffer).
- **CORS on the webhook Function** — Box→Function is server-to-server, so **no** browser CORS preflight
  occurs; the EXPLORE "allow `https://api.box.com`" CORS step is **unnecessary** and is omitted.
  (Azure Functions CORS is a platform setting via `az functionapp cors`, not `host.json`, if ever needed.)
- **Blob purge gate** — lifecycle policies **cannot** read `case_status=box_synced`; a flow-driven
  delete (re-checking Dataverse) is the safer primary, a tag-filtered lifecycle rule the backstop.
  *Open question:* grace period (30 d vs 60 d) — confirm with operator.
- **Folder timing** — provisional-then-rename vs mint-at-parse-confirm. *Recommendation:* parse-confirm
  (simpler, same net result, matches today). Confirm with operator.
- **Shared-link freshness** — minted per-finalize (always fresh, slight latency) vs cached in Dataverse
  (needs a refresh mechanism; links can carry `unshared_at`). *Open question:* confirm policy.
- **Secret naming / environments** — one `box-client-secret` vs `…-test`/`…-prod`. KV holds both;
  confirm the convention the `BOX_WEBHOOK_SECRET_NAME` env-var points at.
- **Scope sufficiency** — `root_readwrite` covers folders/files/metadata/file-requests/shared-links;
  webhooks additionally need `manage_webhook` (verified). Confirm both are on the Platform app.
- **EXPLORE-fact corrections surfaced:** (1) the embed CSP directive is **`frame-src`**, not
  `frame-ancestors`; (2) the webhook Function does **not** need a `https://api.box.com` CORS rule.

## Verification log (sources checked)

**Microsoft Learn (Power Platform / Azure):**
- Custom connector FAQ — **"Client credentials grant type isn't supported"** (forces CCG into the Function backend): https://learn.microsoft.com/connectors/custom-connectors/faq#requirements
- Create connector from OpenAPI — **OpenAPI 2.0 only, <1 MB, no client-credentials in OAuth sec def, top sec def wins**: https://learn.microsoft.com/connectors/custom-connectors/define-openapi-definition#prerequisites
- Custom connector API-key auth (parameter label/name/location on the connection): https://learn.microsoft.com/connectors/custom-connectors/define-blank#step-2-specify-authentication-type
- DLP / connector classification (Premium/Standard coexist; custom connectors governed by classic data policies): https://learn.microsoft.com/power-platform/admin/advanced-connector-policies
- Azure Functions HTTP trigger — **authLevel `function`/`anonymous`/`admin`, `x-functions-key`, base HTTP trigger is the recommended webhook approach in v2.x+**: https://learn.microsoft.com/azure/azure-functions/functions-bindings-http-webhook-trigger#usage
- Flex Consumption deployment storage — **identity-based, system-assigned MI + Storage Blob Data role**: https://learn.microsoft.com/azure/azure-functions/flex-consumption-how-to#configure-deployment-settings
- Functions IaC — **`allowSharedKeyAccess:false` + `AzureWebJobsStorage__*` identity settings**: https://learn.microsoft.com/azure/azure-functions/functions-infrastructure-as-code#create-storage-account
- Key Vault references — **`@Microsoft.KeyVault(SecretUri=…)` resolved by system-assigned MI, role Key Vault Secrets User**: https://learn.microsoft.com/azure/app-service/app-service-key-vault-references#understand-source-app-settings-from-key-vault
- Blob lifecycle delete — **age / prefix / blob-index-tag filters only (no Dataverse join)**: https://learn.microsoft.com/azure/storage/blobs/lifecycle-management-policy-delete
- Blob index tags as lifecycle filter (`blobIndexMatch`): https://learn.microsoft.com/azure/storage/blobs/storage-manage-find-blobs#platform-integrations-with-blob-index-tags
- Code Apps CSP — **`connect-src 'none'`, `frame-src 'self'` defaults; App tab / `PowerApps_CSPConfigCodeApps`**: https://learn.microsoft.com/power-apps/developer/code-apps/how-to/content-security-policy
- Code App iframe embedding (`frame-ancestors` = who may frame the app — the *opposite* direction to embedding Box): https://learn.microsoft.com/power-apps/developer/code-apps/how-to/embed-iframe#configure-csp-to-allow-framing

**Box developer + support docs:**
- CCG auth — **`POST /oauth2/token`, `grant_type=client_credentials`, `box_subject_type=enterprise`, App Access Only, must be Admin-Console authorized**: https://developer.box.com/guides/authentication/client-credentials/
- Webhook signatures — **`BOX-SIGNATURE-PRIMARY/SECONDARY`, HMAC-SHA256 over body++`BOX-DELIVERY-TIMESTAMP`, 10-min replay, dual-key rotation, timing-safe compare**: https://developer.box.com/guides/webhooks/handle/setup-signatures/
- Create webhook — **`POST /2.0/webhooks`, `target.type` file|folder, triggers incl. `FILE.UPLOADED` & `FILE.MOVED`, scope `manage_webhook`**: https://developer.box.com/reference/post-webhooks/
- Create folder — **`POST /2.0/folders` `{name, parent:{id}}`, 409 `item_name_in_use`, names case-insensitive**: https://developer.box.com/reference/post-folders/
- Copy File Request — **`POST /file_requests/{id}/copy` `{folder:{id,type:"folder"}, status, expires_at?}`**: https://developer.box.com/reference/post-file-requests-id-copy/
- Update shared link on file — **`PUT /2.0/files/{id}?fields=shared_link` `{shared_link:{access}}` → `shared_link.url`**: https://developer.box.com/reference/put-files-id/
- Webhooks overview — **retry up to 12× over 2 h, 2xx within 30 s, delivery failure semantics**: https://developer.box.com/guides/webhooks/
- Platform Apps (Admin Console authorize by Client ID; Server vs User Auth): file `C:\Users\Alex\Documents\GitHub\automationsresearch\box\markdown\552-platform-apps.md`
- File Request (Business plan required to build; required/optional **metadata form fields**): file `C:\Users\Alex\Documents\GitHub\automationsresearch\box\markdown\315-about-box-file-request.md`
- Managing File Requests (deactivate vs delete, status active/inactive): file `C:\Users\Alex\Documents\GitHub\automationsresearch\box\markdown\123-managing-file-requests.md`

**Local dossier:**
- `box-integration-pivot/04-target-architecture.md` (B1–B4 phased gated build, the CCG/webhook unlock)
- `box-integration-pivot/07-flaws-risks-and-open-questions.md` (webhook best-effort, File-Request→event unproven, dual-truth)
- `box-integration-pivot/plans/05-dataverse.md` (the `BOX_*` gates + `cr1bd_case` Box columns this section consumes)
- `functions/enrichment/infra/main.bicep`, `functions/addressmatch/infra/main.bicep` (FC1 clone targets)
- `functions/parser/openapi/parser-connector.json` (OpenAPI 2.0 + api-key-on-connection clone target)
- `flows/connection-references.json` (the `cr1bd_box` entry repointed by this plan)
