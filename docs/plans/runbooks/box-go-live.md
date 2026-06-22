# Box production cutover — atomized go-live runbook

> **Scope.** The **copy-pasteable, numbered** production cutover for the Phase-7 Box pivot
> (ADR-0012), to be run **after the Business-tenant test passes** against the test folder
> `392761581105`. This is the cutover off the test folder onto the **production** archive root.
> Each step has a **goal**, **exact files**, **exact commands**, an explicit **GATE** (the
> pass condition you must observe before moving on), and an owner: **[C]** Claude can run it ·
> **[O]** Operator-only (a Box credential, an Admin-Console action, a tenant change, or a live confirm).
>
> **Read first for live truth:** [CURRENT_STATUS.md](../../../CURRENT_STATUS.md) ·
> [docs/architecture/live-environment.md](../../architecture/live-environment.md) ·
> [docs/gated.md](../../gated.md) ·
> [box-integration-activation.md](../phase-7-box-integration/box-integration-activation.md) ·
> [REMAINING-STEPS.md](../phase-7-box-integration/REMAINING-STEPS.md).
>
> **Live constants** (from `live-environment.md`, verified 2026-06-22):
> - Function App: **`cespkbox-fn-v76a47`** → `https://cespkbox-fn-v76a47.azurewebsites.net`, receiver `POST /api/box-webhook`, `authLevel=function`.
> - Key Vault: **`cespkboxkvv76a47`** (empty — secrets pending). Resource group **`rg-collisionspike-dev`**, UK South.
> - Function MI principal: **`5db514c8-25f2-4d94-81ec-3878286d0087`**.
> - Box enterprise: **`941197`** ("Collision Engineers"). CCG app client id stem `rpkw…`.
> - Dataverse org: `https://collisionengineers-dev.crm11.dynamics.com`; env id `b3090c42-51fb-ee24-9868-474da322a3ad`.
> - Test-folder lock (current): app setting `BOX_ALLOWED_ROOT_ID=392761581105`; `tools/box-scope.json` `liveReady:false`.

---

## Prerequisites — must be GREEN before Step 1

These are not part of the cutover; they are the entry gate. Do not start if any fails.

**P-A — [O] CCG Platform app is Admin-authorized.**
- Box Dev Console → app `rpkw…` → App Access = **App + Enterprise Access**; scopes `root_readwrite` + `manage_webhook` → **Save** → Box Admin Console → **Custom Apps Manager → Authorize by client id**. Re-authorize on any scope change (REMAINING-STEPS §1).
- **GATE P-A:** `infisical run --env dev -- node tools/box/phaseA-probe.mjs` prints **`GATE A PASS`** (not `unauthorized_client`). _(If it 404s, collaborate the relevant folder to the service account as Editor — REMAINING-STEPS §2.)_

**P-B — [O] Tenant tier is at least base Box Business.** Base Business covers folders, File Requests, webhooks, and CCG (the whole live path B0/B1/B2). Business Plus is only for the deferred metadata field (out of scope). (box-integration-activation §0.)
- **GATE P-B:** operator confirms the live Box plan in the Admin Console is **Business or higher**.

**P-C — [O] The Business-tenant test passed against folder `392761581105`** — CCG end-to-end, template File-Request copy, **and the BLOCKING B2 `FILE.UPLOADED` live-test** (drag a file into a copied File Request → the folder's `FILE.UPLOADED` webhook fires the Function → case advances Not Ready → Review). (box-integration-activation §5.)
- **GATE P-C:** operator confirms the B2 loop fired at least once on the test folder.

**P-D — [C] Offline gates green** (DEPLOY-RUNBOOK §0). Run from repo root:
```bash
node verify-all.mjs                       # final line: OK — … 0 failed
node flows/validate-flows.mjs             # 154/154
node tools/box/test-scope-guard.mjs       # 20 passed
```
- **GATE P-D:** all three pass with the counts above.

---

## Step 1 — [O] Create the PRODUCTION archive root + drop-box parent in Box

**Goal.** Designate the production folders the flows will write to (replacing the test folder `392761581105`).

**Files:** none (Box web app action).

**Do:**
1. In the Box web app, create **one root** for all case archives (e.g. `/CasePoArchive/`) and a parent for drop-boxes (e.g. `/DropBoxes/`).
2. Copy the **production archive-root folder id** from its URL — call it `<PROD_ROOT_ID>`. Record it; every later step uses it.
3. If the CCG service account does not own these folders, collaborate the service account as **Editor** on `<PROD_ROOT_ID>` (box-integration-activation §3).

**GATE 1:** `<PROD_ROOT_ID>` is recorded, and the service account can read it:
```bash
infisical run --env dev -- node tools/box/phaseA-probe.mjs --folder <PROD_ROOT_ID>
```
prints the production folder name (200), not 404.

---

## Step 2 — [C] Confirm/redeploy the box-webhook Function (it is already deployed gated-off)

**Goal.** Ensure `cespkbox-fn-v76a47` is live and carries the current build. The Function is already deployed gated-off and Gate-C-verified; only redeploy if the repo build has moved on since.

**Files:** `functions/box-webhook/infra/main.bicep`, `functions/box-webhook/` (app code).

**Do (verify):**
```bash
az functionapp show -g rg-collisionspike-dev -n cespkbox-fn-v76a47 --query state -o tsv   # Running
curl.exe -i "https://cespkbox-fn-v76a47.azurewebsites.net/api/box-webhook"                 # expect 401 (no key)
```
**Do (only if a redeploy is needed):**
```bash
az bicep build --file functions/box-webhook/infra/main.bicep
az deployment group create -g rg-collisionspike-dev \
  --template-file functions/box-webhook/infra/main.bicep \
  --parameters boxApiEnabled=false boxEnterpriseId=941197 boxClientId=<BOX_CLIENT_ID> boxAllowedRootId=392761581105
func azure functionapp publish cespkbox-fn-v76a47
```
> Keep `boxApiEnabled=false` and `boxAllowedRootId=392761581105` here — the gate flip and root re-point are Steps 8/9, not now. The bicep declares only **KV references** (`box-client-secret`, `box-webhook-primary-key`, `box-webhook-secondary-key`, `status-evaluate-flow-url`); it never holds a literal.

**GATE 2:** `state=Running`; the receiver returns **401** with no key (proves the receiver is live and key-protected); App Insights component `cespkbox-ai-…` is bound.

---

## Step 3 — [C/O] Write the Key Vault secret VALUES

**Goal.** Populate the empty vault `cespkboxkvv76a47` so the `@Microsoft.KeyVault(SecretUri=…)` app settings resolve. The names are **hyphenated** and resolve into UPPER_SNAKE app settings (bicep lines 52–62).

**Files:** none (the KV references already exist in `main.bicep`).

**Owner split:** the **operator [O]** supplies the secret VALUES (a Box credential — `box-client-secret`, and the two HMAC keys Box generates); **Claude [C]** can run the `az` writes once the values exist. `box-client-secret` can also come from Infisical `box_client_secret`.

**Do (webhook signature keys — [O] generates in Box first):** Box Dev Console → app → Webhooks → **Manage Signature Keys** → generate **Primary + Secondary** (shown once). Then:
```bash
az keyvault secret set --vault-name cespkboxkvv76a47 --name box-client-secret           --value <CLIENT_SECRET>
az keyvault secret set --vault-name cespkboxkvv76a47 --name box-webhook-primary-key     --value <PRIMARY>
az keyvault secret set --vault-name cespkboxkvv76a47 --name box-webhook-secondary-key   --value <SECONDARY>
az keyvault secret set --vault-name cespkboxkvv76a47 --name status-evaluate-flow-url    --value "<CS Status Evaluate Request URL>"
```
> `status-evaluate-flow-url` is the **CS Status Evaluate** Request-trigger URL (workflow `4d963ff7-7f14-40e5-aa3c-07b741b0cba5`) — the receiver re-invoke transport. Get it from the live flow's "When a HTTP request is received" trigger.
> Set the non-secret `BOX_CLIENT_ID` (from Infisical `box_client_id`) + `BOX_ENTERPRISE_ID` as plain app settings if not already present:
> ```bash
> az functionapp config appsettings set -g rg-collisionspike-dev -n cespkbox-fn-v76a47 --settings BOX_CLIENT_ID=<id> BOX_ENTERPRISE_ID=941197
> ```

**GATE 3:** all four secrets exist and resolve. Verify resolution (no `@Microsoft.KeyVault` literal leaking through):
```bash
az keyvault secret list --vault-name cespkboxkvv76a47 --query "[].name" -o tsv   # 4 names present
az functionapp restart -g rg-collisionspike-dev -n cespkbox-fn-v76a47
az functionapp config appsettings list -g rg-collisionspike-dev -n cespkbox-fn-v76a47 \
  --query "[?name=='BOX_CLIENT_SECRET'].value" -o tsv                            # shows a KeyVault reference that the portal marks 'resolved'
```
The Function App's Configuration blade shows the four KV-referenced settings as **Resolved** (green), not error.

---

## Step 4 — [O] Grant the Function MI a Dataverse Application User

**Goal.** Let the webhook receiver write Evidence/Audit to Dataverse via its managed identity (REMAINING-STEPS §5). Needed before Phase-F (receiver writes), not for the pure firing test.

**Files:** none (Power Platform Admin Center action).

**Do:** Power Platform Admin Center → **Collision Engineers - Dev** → Settings → **Application users → New** → app = the Function MI (principal **`5db514c8-25f2-4d94-81ec-3878286d0087`**) → assign a security role with **Create** on `cr1bd_evidence` + `cr1bd_auditevent` and **Read** on `cr1bd_case`.

**GATE 4:** the application user appears in the env's Application users list, **Enabled**, bound to principal `5db514c8-…`, with the role attached.

---

## Step 5 — [O] Import + bind the `cr1bd_box_rest` custom connector

**Goal.** Bring the parallel custom Box REST connector online with the Function host key on the connection. This is operator-only: custom-connector import and the connection bind need your sign-in, and the host key is a credential. (connection-references.json; REMAINING-STEPS §6.)

**Files:**
- `functions/box-webhook/openapi/box-connector.json` — **edit `host` (line 11)** from `REPLACE-WITH-BOX-WEBHOOK-FUNCTION-HOST.azurewebsites.net` to **`cespkbox-fn-v76a47.azurewebsites.net`** (basePath stays `/api`).
- `functions/box-webhook/openapi/box-connector.apiProperties.json` — already declares `connectionParameters.api_key` (an `apiKey` securityDefinition alone does **not** create the connection parameter; this is load-bearing — proven for `cr1bd_ceparser`).

**Do:**
1. Set the OpenAPI `host` as above (a one-line edit; **[C]** can prepare this edit, but the import + bind are **[O]**).
2. Import `box-connector.json` + `box-connector.apiProperties.json` into the Dev environment as the custom connector backing `shared_box_rest` / logical `cr1bd_box_rest`.
3. Create the connection, supplying the **Function host key** (the `api_key` connection parameter). The Box `client_secret` is **never** on this connection — it is a Function-side KV ref only.
4. Bind **BOTH** Box connections — this is a parallel ref, **not** a repoint:
   - `cr1bd_box_rest` (`shared_box_rest`, Premium, custom) — folder-create / File-Request copy / shared-link / webhook lifecycle.
   - `cr1bd_box` (`shared_box`, Standard, interactive OAuth) — **retained** for `finalize-eva-box`'s byte path (`CreateFile` after `GetFileContentByPath_V2`).
5. `pac code add-data-source` to regenerate the Code App service if the app surfaces the connector ops.

**GATE 5:** the connection shows **Connected**; a smoke call to an operation id succeeds against the production root. operationIds the generated `*Service` methods must equal: `CreateFolder, CopyFileRequest, GetSharedLink, GetFolderSharedLink, ListFolder, CreateWebhook, GetWebhook, DeleteWebhook, GetFileRequest, UpdateFileRequest, DeleteFileRequest`. Confirm `finalize` never references `shared_box_rest` and only `box-folder-create`/`box-file-request-copy`/`case-resolve` may (validate-flows.mjs check 9a):
```bash
node flows/validate-flows.mjs            # 154/154, connector-binding check 9a green
```

---

## Step 6 — [C] Point Dataverse + the build guards at the PRODUCTION root

**Goal.** Move the flows' archive root off the test folder and lift the build-time scope guard.

**Files:** `tools/box-scope.json` (build-time guard), Dataverse env-var `cr1bd_BOX_FOLDER_ROOT_ID` (live), Dataverse env-var `cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID` (live, Step 7).

**Do (a) — extend the scope guard for production:** edit `tools/box-scope.json`:
- Append `<PROD_ROOT_ID>` (and the `/DropBoxes/` parent id) to `allowedIds`.
- Set `liveReady: true` — this lifts the blocking PreToolUse hook `.claude/hooks/box-scope-guard.mjs` so ops may run outside the test folder (tools/box/README §Scope guard).
- (Children created under an allowed parent are auto-tracked by `.claude/hooks/box-scope-postcreate.mjs`.)

**Do (b) — set the live config var.** Set `cr1bd_BOX_FOLDER_ROOT_ID` **currentValue** = `<PROD_ROOT_ID>` (the archive-root supplied to `CreateFolder` as `parent.id`). The flows read this via env-var, never hardcoded (the `BOX_ID_LITERAL_RE` linter guard forbids literal ids). Set it on the environmentvariablevalue row for `cr1bd_BOX_FOLDER_ROOT_ID` (Power Apps maker portal → Solutions → CollisionSpike → the env-var → **Current value**, or via the Dataverse Web API `environmentvariablevalues`).

**GATE 6:**
```bash
node tools/box/test-scope-guard.mjs      # still 20 passed (guard config valid)
```
- `tools/box-scope.json` shows `liveReady:true` and `<PROD_ROOT_ID>` in `allowedIds`.
- Dataverse: `cr1bd_BOX_FOLDER_ROOT_ID` current value reads `<PROD_ROOT_ID>` (confirm via the maker portal or a Web API GET on `environmentvariablevalues`).

---

## Step 7 — [O] Hand-build the ONE production template File Request → set the template id

**Goal.** Create the copy-from-template source (there is **no** create-from-scratch File-Request API). (box-integration-activation §4.)

**Files:** Dataverse env-var `cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID` (live).

**Do:**
1. In the Box web app, pin **one** File Request to a folder (e.g. `/FileRequest-Template/`); set the capture form = **email + description** (on base Business there is **no** metadata reg field — that is the deferred Business Plus upgrade).
2. Record its `file_request_id` from the builder URL → `<PROD_TEMPLATE_ID>`.
3. **[C]** set `cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID` **currentValue** = `<PROD_TEMPLATE_ID>`.

> Per case the flow does `POST /file_requests/{templateId}/copy` onto the Case/PO folder (`CopyFileRequest`); deactivate with `PUT /file_requests/{id}` `{status:"inactive"}` (`UpdateFileRequest`) — the link then 404s.

**GATE 7:** `cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID` current value reads `<PROD_TEMPLATE_ID>`; a manual `CopyFileRequest` smoke call against a throwaway production folder returns a live upload URL.

---

## Step 8 — [C] Activate the Box flows + register them in flow-state.json

**Goal.** Import + turn on the three Box flows and the finalize/case-resolve deltas, and reconcile `flows/flow-state.json` so the linter reflects the live state.

**Files:**
- `flows/definitions/box-folder-create.definition.json`
- `flows/definitions/box-file-request-copy.definition.json`
- `flows/definitions/box-blob-purge.definition.json`
- `flows/definitions/finalize-eva-box.definition.json` (the Phase-7 rewrite — folder pre-exists → augments, reads `cr1bd_BOX_FOLDER_ROOT_ID`, Dataverse submit-signal trigger, stamps `cr1bd_status=box_synced` (100000009) + `cr1bd_boxsyncedat` last)
- `flows/definitions/case-resolve.definition.json` (survivor-folder ensure)
- `flows/flow-state.json` (the manifest the linter asserts against)

**Do:**
1. Import/activate the Box flows into the live `CollisionSpikeFlows` solution. **Order matters:** activate `box-folder-create` and `box-file-request-copy` (children) before any caller. The live **CS Finalize EVA + Box** (workflow `8d70ba4c-3a5b-49bb-a499-4198bb4e9067`) is still the **older M1 definition** — import the Phase-7 `finalize-eva-box` rewrite to replace it.
2. Update `flows/flow-state.json`: flip the activated Box flows' `state` from `"off"` to `"on"` with an `activatedLive`/`activationBoundary` note (mirror the existing `case-resolve` entry pattern). The `globalRule` / `summary` block must stay internally consistent (linter asserts every definition is listed).

**GATE 8:**
```bash
node flows/validate-flows.mjs            # passes with the new state=on entries (no "must be off" failure)
```
- Live flow inventory shows `box-folder-create`, `box-file-request-copy`, `box-blob-purge`, and the rewritten `CS Finalize EVA + Box` **ON** (`category eq 5` query).
- `box-blob-purge` is imported but its Recurrence `startTime` is still the far-future placeholder (its real schedule is Step 11).

---

## Step 9 — [C] Live-edit CS Intake to call box-folder-create (PATCH the actions node only)

**Goal.** Invoke `box-folder-create` at parse-confirm, where `cr1bd_casepo` first exists. (box-integration-activation §9; memories `intake-repo-trails-live`, `flow-webhook-trigger-provisioning`.)

**Files:** the **LIVE** `CS Intake (shared mailbox)` flow (workflow `92131f3d-9cd5-4e88-aa9e-a5705a5850a0`, internal `8d534fc9-…`). **Do NOT** edit the stale repo `flows/definitions/intake.definition.json` (it already trails live, lacking `Run_enrich`/`Run_case_resolve`).

**Do:**
1. Pull the live `clientdata` for CS Intake; save a `%TEMP%` rollback backup of it.
2. Insert `Run_box_folder_create` inside `Scope_generate_casepo → If_needs_casepo` (true branch), **after** `Update_case_casepo`, `runAfter: { "Update_case_casepo": ["Succeeded"] }`. Body: `caseId` (`@variables('caseId')`), `casePo` (the just-generated Case/PO, `@outputs('Compose_next_casepo')`), `workProviderId`. Rebind `host.workflowReferenceName` to the live `box-folder-create` GUID **in the designer**.
3. **PATCH ONLY the `actions` node — NEVER the `triggers` node.** The `OnNewEmailV3` Office-365 webhook must stay **byte-identical** (clientdata cannot re-arm an Office-365 webhook).
4. The child gates internally on `cr1bd_BOX_FOLDER_AT_INTAKE_ENABLED` and no-ops (`outcome:"gated_off"`) until that gate flips — so this insertion lands **before** Step 10 with **zero behavioural change**.

**GATE 9:**
- The CS Intake trigger node is **byte-identical** to the pre-edit backup (diff the `triggers` block; must be empty).
- A test email to `digital@collisionengineers.co.uk` still produces a **Succeeded** intake run and a `cr1bd_cases` row (webhook survived).
- The run shows `Run_box_folder_create` executed and returned `gated_off` (gate still false at this point).

---

## Step 10 — [C] Flip the BOX_* gates, in strict order, test env first

**Goal.** Light up the connector, then folder-create, then File-Requests — in the mandated order, with **~1h publish latency** between meaningful changes (box-integration-activation §2). Set each as the Dataverse env-var **currentValue** (`true`). The Code App reads gates; flows read gates; never write them from the app.

**Files:** Dataverse env-vars `cr1bd_BOX_API_ENABLED`, `cr1bd_BOX_FOLDER_AT_INTAKE_ENABLED`, `cr1bd_BOX_FILEREQUEST_ENABLED` (`dataverse/environment-variables.json` is the schema-of-record; you flip the live currentValue rows). Also flip the **Function** gate to match the connector facade:
```bash
az functionapp config appsettings set -g rg-collisionspike-dev -n cespkbox-fn-v76a47 --settings BOX_API_ENABLED=true
```

**Do — flip 10a `cr1bd_BOX_API_ENABLED=true`.** Pre-reqs: P-A done, connection bound (Step 5). Unlocks the custom connector + webhook receiver. Also set the Function `BOX_API_ENABLED=true` (above) so the facade stops returning 503.
- **GATE 10a:** the receiver facade no longer returns 503 for a valid signed call; a `CreateFolder` connector op succeeds against `<PROD_ROOT_ID>`. Wait ~1h for publish before 10b.

**Do — flip 10b `cr1bd_BOX_FOLDER_AT_INTAKE_ENABLED=true`.** Pre-req: `cr1bd_BOX_FOLDER_ROOT_ID=<PROD_ROOT_ID>` set (Step 6b). Unlocks folder-create at parse-confirm + the finalize augment.
- **GATE 10b — B1 live archive test:** a new instructions case mints **one UPPERCASE** Case/PO folder (e.g. `CCPY26001`) under `<PROD_ROOT_ID>`; on finalize the photo order is correct (2 previews first — overview shows the **full registration**), reflection-excluded photos absent, lowercase `<casepo>.eva.json` present **inside** the UPPERCASE folder. Confirm Box honours the UPPERCASE format (a lowercase sibling 409s `item_name_in_use`). Wait ~1h before 10c.

**Do — flip 10c `cr1bd_BOX_FILEREQUEST_ENABLED=true`.** Pre-reqs: `cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID=<PROD_TEMPLATE_ID>` set (Step 7) **and P-C** (the B2 `FILE.UPLOADED` loop already proven). Unlocks the per-case File-Request copy + drop-boxes.
- **GATE 10c — B2 production loop:** copy a File Request onto a live case folder, drag a file in → the folder's `FILE.UPLOADED` webhook fires the Function → the case advances **Not Ready → Review**. On a transient miss, the receiver returns non-2xx (503) so **Box retries** (the primary recovery; Box does not retry after a 2xx). The receiver dedups durably on the Evidence-existence `box:file:<id>` tag in `cr1bd_sourcemessageid`.

> `cr1bd_BOX_EMBED_ENABLED` stays **reserved/OFF** — evidence is linked, not embedded (server-minted "Open in Box" deep link; no iframe, no `frame-src` edit). `cr1bd_BOX_METADATA_ENABLED` / `BOX_AI_ENABLED` are Phase-C, **not flipped here**. **EVA stays gated OFF throughout** — Box never gates EVA.

---

## Step 11 — [C] Re-subscribe the FILE.UPLOADED webhook onto the PRODUCTION root

**Goal.** Move the webhook off the test folder onto `<PROD_ROOT_ID>` (REMAINING-STEPS "Steps Claude can run"; box-integration-activation §6).

**Files:** none (connector ops). Address uses the Function receiver + host key.

**Do:**
1. `DeleteWebhook` the test-folder (`392761581105`) subscription (`GetWebhook` to find its id first).
2. `CreateWebhook` on `<PROD_ROOT_ID>`: address `https://cespkbox-fn-v76a47.azurewebsites.net/api/box-webhook?code=<host-key>`, triggers `["FILE.UPLOADED"]`. Prefer a **single archive-root (recursive)** or per-repeat-sender webhook over per-case (per-app webhook ceiling cited ~1000, UNVERIFIED; only the 409-on-duplicate-target+app+user is confirmed).

**GATE 11:** `GetWebhook` shows exactly one active `FILE.UPLOADED` subscription, target `<PROD_ROOT_ID>`, address the production receiver URL; the test-folder subscription is gone. A control upload into a child of `<PROD_ROOT_ID>` produces a `FILE.UPLOADED` trace in `cespkbox-fn-v76a47` App Insights.

---

## Step 12 — [C] Decide + set the Function Layer-2 lock for production

**Goal.** Resolve the open question on `BOX_ALLOWED_ROOT_ID` at cutover. `bicep` line 45: **empty lifts the lock for production**; a non-empty production root id still constrains ops as defence-in-depth (`box_client.py` refuses any op not under it, HTTP 400).

**Files:** Function app setting `BOX_ALLOWED_ROOT_ID` (currently `392761581105`).

**Do (operator decision):**
- **Defence-in-depth (recommended):** set the lock to `<PROD_ROOT_ID>`:
  ```bash
  az functionapp config appsettings set -g rg-collisionspike-dev -n cespkbox-fn-v76a47 --settings BOX_ALLOWED_ROOT_ID=<PROD_ROOT_ID>
  ```
- **Fully lift:** clear it:
  ```bash
  az functionapp config appsettings set -g rg-collisionspike-dev -n cespkbox-fn-v76a47 --settings BOX_ALLOWED_ROOT_ID=""
  ```

**GATE 12:** an op targeting a folder **outside** `<PROD_ROOT_ID>` is refused with HTTP 400 (if set to the prod root), or allowed (if intentionally cleared) — and an op on a `<PROD_ROOT_ID>` descendant succeeds either way. Confirm the chosen value:
```bash
az functionapp config appsettings list -g rg-collisionspike-dev -n cespkbox-fn-v76a47 --query "[?name=='BOX_ALLOWED_ROOT_ID'].value" -o tsv
```

---

## Step 13 — [O/C] Set the blob-purge schedule (do this LAST)

**Goal.** Arm `box-blob-purge` only once Box is proven the archive of record — it deletes **archived (accepted-for-EVA, non-excluded) IMAGE** Blob evidence bytes for `box_synced` cases past the grace window (never the Box copy, never the Evidence row, never non-image transient bytes). It ships with a **far-future Recurrence placeholder** so it never fires on deploy.

**Files:** `flows/definitions/box-blob-purge.definition.json` (Recurrence `startTime` placeholder + `PurgeGraceDays`). Connection `cr1bd_evidenceblob` (`shared_azureblob`) must be bound for it to run.

**Do:**
1. **[O]** bind the `cr1bd_evidenceblob` Azure Blob connection (account `cespkevidstdev01`, container `evidence`) if not already bound.
2. **[C]** set a real near-term Recurrence `startTime` (replacing the far-future placeholder) and pin `PurgeGraceDays` (the grace window read against `cr1bd_boxsyncedat`). Re-import/update the flow.
3. Confirm its gate `cr1bd_BOX_API_ENABLED` is `true` (Step 10a) — it is the outer guard.

**GATE 13 (deliberately conservative):**
- First run **dry**: confirm the run targets only `box_synced` image evidence past `PurgeGraceDays` (inspect the run history / a no-op or guarded first pass) before any real delete.
- After the first real run: the purged Blob bytes are gone **but** the Box copy and the `cr1bd_evidence` row remain; a `box_synced` case inside the grace window is **untouched**.
- `node flows/validate-flows.mjs` still passes with `box-blob-purge` carrying its production schedule.

---

## Post-cutover reconciliation (do not skip — prevents a re-import regressing live)

**[C]** Before any solution re-import, reconcile the **repo** `flows/definitions/intake.definition.json` to live by adding `Run_enrich` + `Run_case_resolve` + `Run_box_folder_create` (it currently trails live by design). A solution re-import without this would **regress** the live wiring. (memory `intake-repo-trails-live`; box-integration-activation §9 closing note.) Re-run `node verify-all.mjs` → `0 failed`.

---

## Gate summary (one line each)

| # | Step | Owner | GATE |
|---|---|---|---|
| P-A | CCG Admin-auth | [O] | `phaseA-probe.mjs` → `GATE A PASS` |
| P-B | Tenant ≥ Business | [O] | plan confirmed Business+ |
| P-C | Business B2 test passed | [O] | `FILE.UPLOADED` loop fired on test folder |
| P-D | Offline gates | [C] | verify-all 0 failed · flows 154/154 · scope-guard 20 |
| 1 | Prod root created | [O] | `<PROD_ROOT_ID>` recorded, probe reads it (200) |
| 2 | Function live | [C] | `Running`; receiver 401 with no key |
| 3 | KV secrets written | [C/O] | 4 secrets resolve (Configuration = Resolved) |
| 4 | Function MI app user | [O] | Application user Enabled, role attached |
| 5 | Connector import + bind | [O] | connection Connected; flows 154/154 (check 9a) |
| 6 | Prod root re-point | [C] | `liveReady:true`; `cr1bd_BOX_FOLDER_ROOT_ID=<PROD_ROOT_ID>` |
| 7 | Template File Request | [O] | `cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID=<PROD_TEMPLATE_ID>` |
| 8 | Box flows activated | [C] | flows ON; linter passes new state=on |
| 9 | Intake live-edit | [C] | trigger byte-identical; test email → case; child gated_off |
| 10a | BOX_API_ENABLED | [C] | facade no longer 503; CreateFolder succeeds |
| 10b | BOX_FOLDER_AT_INTAKE_ENABLED | [C] | B1: UPPERCASE folder + photo order + .eva.json |
| 10c | BOX_FILEREQUEST_ENABLED | [C] | B2: File Request → FILE.UPLOADED → Not Ready→Review |
| 11 | Webhook re-subscribe | [C] | one active sub on `<PROD_ROOT_ID>`; test-folder sub gone |
| 12 | Layer-2 lock decision | [O/C] | out-of-root op 400 (or allowed if cleared) |
| 13 | Blob-purge schedule | [O/C] | dry first; bytes purged, Box+Evidence intact, grace honoured |
