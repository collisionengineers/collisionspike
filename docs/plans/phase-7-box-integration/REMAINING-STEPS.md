# Box integration — exact remaining steps (what can't be done here-and-now)

> Snapshot **2026-06-22**. Everything is hard-scoped to the test folder **`392761581105`**
> (`tools/box-scope.json`, `liveReady:false`). Owner tags: **[BOX]** Box admin/web-UI ·
> **[PPADMIN]** Power Platform admin · **[CLAUDE]** Claude can do once its blockers clear.

## Done this session (no action needed)
- **Phase 0 scope guard** — 4 layers, armed, `node tools/box/test-scope-guard.mjs` → 20/20.
- **Layer-2** `BOX_ALLOWED_ROOT_ID` in the Function (79 pytest, bicep builds).
- **Phase A probe / Phase B harness / sink** in `tools/box/`.
- **Phase C infra** — `box-webhook` Function deployed to `rg-collisionspike-dev`, **gated off**
  (`BOX_API_ENABLED=false`), no secrets yet. (Resource names recorded in `live-environment.md`.)

## The critical unlock — everything Box-live waits on this

### 1. Authorize the CCG Platform app in Box — **[BOX]** (THE blocker)
Gate A currently returns `unauthorized_client` ("box_subject_type unauthorized").
- Box **Dev Console** → app `rpkw…` → *Configuration*: **App Access = App + Enterprise Access**;
  scopes ☑ *Write all files and folders* (`root_readwrite`) + ☑ *Manage webhooks* (`manage_webhook`); **Save**.
- Box **Admin Console** → *Apps → Custom Apps Manager* → **Authorize** by client id `rpkw…`
  (enterprise `941197`, "Collision Engineers").
- **Verify:** `infisical run --env dev -- node tools/box/phaseA-probe.mjs` → `GATE A PASS`.

### 2. Collaborate the test folder to the service account — **[BOX]** (only if Gate A then 404s)
The CCG service account must see folder `392761581105`. If the probe 404s after step 1, add the
service account as **Editor** collaborator on the test folder (Box web UI), then re-run the probe.

### 3. Generate the webhook signature keys in Box → Key Vault — **[BOX]** + **[CLAUDE]**
Box generates these (they are NOT ours to invent — they must match what Box signs with).
- Box **Dev Console** → app → *Webhooks* → **Manage Signature Keys** → generate **Primary** + **Secondary** (shown once; copy both).
- Store in Key Vault `cespkboxkvv76a47` (Claude can run this once the values exist):
  `az keyvault secret set --vault-name cespkboxkvv76a47 --name box-webhook-primary-key --value <PRIMARY>`
  (and `box-webhook-secondary-key`).

### 4. Hand-build the ONE template File Request — **[BOX]** (Phase F)
File Requests can't be created via API, only copied. In the Box web UI, create one File Request
under the test folder; record its id → set `cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID`.

## Power Platform / Dataverse steps

### 5. Grant the Function's managed identity a Dataverse Application User — **[PPADMIN]** (before Phase F)
The receiver writes Evidence/Audit via its MI. Power Platform Admin Center → **Collision Engineers - Dev**
→ Settings → *Application users* → **New** → app = the Function MI (principal
`5db514c8-25f2-4d94-81ec-3878286d0087`) → role with create on `cr1bd_evidence`/`cr1bd_auditevent`, read on
`cr1bd_case`. *(Not needed for the pure FILE.UPLOADED firing test — only when the receiver writes Dataverse.)*

### 6. Import the `cr1bd_box_rest` connector + bind the connection — **[PPADMIN]** (Phase D)
- Set the connector OpenAPI `host` (`functions/box-webhook/openapi/box-connector.json`) to the deployed Function host.
- Import `box-connector.json` + `box-connector.apiProperties.json` into the Dev environment.
- Create the connection with the **Function host key** (the `api_key` connection parameter).
- `pac code add-data-source`; wire the generated services in the Code App.

## Steps **[CLAUDE]** can run as soon as #1 (and #3 for the webhook) land
- **Set `box-client-secret` in Key Vault** from Infisical `box_client_secret`; set the `BOX_CLIENT_ID`
  app setting from Infisical `box_client_id` (non-secret).
- **Subscribe the webhook:** CreateWebhook target `392761581105` (folder), address
  `https://cespkbox-fn-v76a47.azurewebsites.net/api/box-webhook?code=<host-key>`, triggers `["FILE.UPLOADED"]`.
- **Phase B firing test:** `node tools/box/phaseB-livetest.mjs setup --url <that URL> --template <id>` → upload → confirm `FILE.UPLOADED` in App Insights.
- **Flip gates** (Dev Dataverse): `cr1bd_BOX_FOLDER_ROOT_ID=392761581105`, then
  `BOX_API_ENABLED` → `BOX_FOLDER_AT_INTAKE_ENABLED` → `BOX_FILEREQUEST_ENABLED` (staged).
- **Import + activate the Box flows**; live-edit CS Intake to call `box-folder-create` (actions node only, byte-identical trigger).
- **`status-evaluate-flow-url`** → Key Vault (the CS Status Evaluate Request URL, for the receiver re-invoke at Phase F).

## Hard gates summary
| # | Step | Owner | Blocks |
|---|---|---|---|
| 1 | Authorize CCG app | **[BOX]** | all Box-live work |
| 2 | Collaborate test folder | **[BOX]** | Gate A (if 404) |
| 3 | Webhook signature keys | **[BOX]** | webhook verification |
| 4 | Template File Request | **[BOX]** | Phase F chaser |
| 5 | Dataverse app user | **[PPADMIN]** | webhook → Evidence |
| 6 | Connector import + bind | **[PPADMIN]** | Code App Box ops |

Once **#1** (and **#3**) are done, Claude can drive the FILE.UPLOADED test, gate flips, flow import,
and the webhook subscription end-to-end against the test folder.
