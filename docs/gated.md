# What still needs you

This is the short list of things the **live Azure system can't finish on its own** — they need you to
supply a password/key, click a button in a live Azure/Entra account, grant a mailbox role, or make a
business/legal decision. Everything else has been built and deployed.

Each item below says **what it is**, **why only you can do it**, and the **exact steps**.

_Last updated **2026-07-03 (second wave)** — **D7 (taxonomy DDL) + D8 (identification seed) + the Phase-4
`ai_suggestion.embedding` delta are now APPLIED LIVE**; the parser is **redeployed** (3 functions,
taxonomy-v2 engine + the 2026-07-03 classifier hardening); all four `TRIAGE_*` gates are now `true` on
`cespk-orch-dev` (the triage policy is **ACTING**, not shadow-only — see D7/D8 below). Six provider
`known_email_domains` corrected (seed `916_provider_domain_corrections.sql` Section A — see D3). The
Exchange `Mail.ReadWrite` grant (B4) is **in progress** (device-code sign-in with the operator under way).
Earlier the same day, the nine-task activation flipped `OUTLOOK_MOVE_ENABLED` (SPA "File to …"
live, Graph moves still 403 pending that same Exchange `Mail.ReadWrite` grant — B4), `PLATE_OCR_ENABLED` +
`OCR_SCANNED_PDF_ENABLED` + `EMAIL_AI_ENABLED` (D6 item 3, this session's sign-off) on production, and
brought Azure Maps / location-assist live; the provider API intake channel (TKT-055) shipped awaiting a
first-key mint + e2e smoke. Prior: the **2026-06-29** production mailbox cutover (intake live on info@ +
engineers@ + desk@; test/dev mailbox digital@ removed). Reframed to the **live Azure PaaS stack**. The Power Platform
implementation (Power Apps Code App, Dataverse, the ~16 Power Automate flows, the custom connectors) has
been **migrated off to Azure** and its footprint **deprovisioned 2026-06-27** (the Dev sandbox deleted via
`pac admin delete`). Its old operator checklist is preserved, clearly banded, at the bottom under
**"Historical — Power Platform operator backlog (deprovisioned 2026-06-27)."** The **domain rules are
unchanged** (EVA 12-field contract, photo order, image rules, provider corpus, Case/PO format) — only the
platform mechanism changed._

> **What "live" means now.** The system is the **Azure PaaS stack** in resource group
> `rg-collisionspike-dev` (region **uksouth**), subscription `e6076573-…`:
> - **SPA** — Static Web App **`cespk-spa-dev`** (westeurope) at
>   `https://proud-sky-04e318b03.7.azurestaticapps.net`, React/Vite from `mockup-app/`, **MSAL/Entra
>   workforce sign-in** (staff only), calling the API over REST.
> - **Data API** — Function App **`cespk-api-dev`** (Node 20 / TypeScript), Entra-JWT-validated with app
>   roles **`CollisionSpike.User` / `CollisionSpike.Superuser`** (Superuser is the full-privilege role
>   renamed from `CollisionSpike.Admin`, legacy name still accepted; a `CollisionSpike.Engineer` placeholder
>   is defined but not enforced), on Postgres.
> - **Orchestration** — Function App **`cespk-orch-dev`** — email intake is **LIVE** on the production
>   mailbox set: **Microsoft Graph PUSH change-notification subscriptions** over **info@ + engineers@ +
>   desk@** (all Exchange-RBAC-scoped; the 2026-06-29 mailbox cutover added info@ + desk@ and removed the
>   test/dev mailbox digital@); transport is **push, not delta-poll**. Manual case-create remains alongside.
>   ✅ Subscriptions are kept alive by the durable `subscriptionMonitorOrchestrator` (renewal RESOLVED 2026-06-29; see the renewal note below).
> - **Database (system of record)** — Postgres Flexible **`cespk-pg-dev`** (v16), database
>   `collisionspike` (table + corpus counts in the registry
>   [architecture/live-environment.md](./architecture/live-environment.md), single source
>   [LIVE_FACTS.json](../LIVE_FACTS.json); `case_`=0).
> - **Retained, unchanged** — the **6 Python Functions** (parser `cespike-parser-dev`, enrichment,
>   `evasentry`, `evavalidation`, `ocr`, `box-webhook`), the **Key Vaults**, the evidence Blob store
>   **`cespkevidstdev01`**, App Insights / Log Analytics.

---

## ✅ Already working live — nothing for you to do here

These domain capabilities are **deployed and functioning** on the Azure stack:

- **Reading the documents (parser).** The parser Function `cespike-parser-dev` is deployed and extracts
  real PDFs/DOCX/EML/MSG. **OCR** for scanned images is the separate `ocr` Function.
  **Platform limit (FC1):** legacy table-heavy `.doc` files may miss table-cell narrative on the binary-scrape
  path because LibreOffice cannot be installed on Flex Consumption without a **custom container** migration
  ([ROADMAP Later](../ROADMAP.md) — parser container item; [TKT-001 follow-up](./tickets/TKT-001-document-parsing/changes-regression-01-07-26.md)).
  Triage QDOS intake is bridged by the orchestration email-body supplement when the attachment parse returns
  empty `accident_circumstances`.
- **Vehicle look-ups (DVSA/DVLA enrichment).** The enrichment Function is deployed and calls **DVSA + DVLA
  directly** (Entra `client_credentials` + `X-API-Key`) — no Google Cloud gateway in the path
  (live-verified previously: `BC23JZE` → SsangYong Rexton).
- **EVA readiness / validation logic.** The `evasentry` + `evavalidation` Functions and the image-rule /
  case-status logic are deployed (EVA **submission** stays off until you supply its login — see EVA item
  below).
- **Seed data loaded into Postgres.** The provider, repairer, image-source and inspection-address
  suggestions corpus is seeded and served to the SPA (live counts in the registry
  [architecture/live-environment.md](./architecture/live-environment.md)).
- **Staff sign-in.** Entra **workforce** MSAL sign-in is live on the SPA; the API enforces the two app
  roles. (Only **one** staff principal is role-assigned so far — see the app-role item below.)

---

## 🔴 Needs you — with steps

The items are grouped: **time-critical / security first**, then **turn on email intake**, then **staff
access**, then the **retained integrations and data**, then **policy/legal**.

---

### A. Time-critical & security

#### A0. Re-authenticate the Azure CLI session (`az login`)  ·  *✅ RESOLVED (recurring — re-check when Azure calls 401)*

**✅ Resolved 2026-07-02:** the session is authenticated again (`az account show` → subscription enabled;
the rules-engine-v2 deploys, RBAC grant and live probes all ran on it). Kept as a standing item because
CLI tokens expire periodically — when `az`/MCP Azure calls start failing with token errors, re-run the
steps below.

**What (historical):** the Azure CLI session token expired (during the 2026-06-28 work). `az` **and** the agent's MCP
Azure tools both fail with *"An attempt was made to reference a token that does not exist"* / 401 — so **no
live Azure change can be made** (no Key Vault writes, app-setting changes, deploys, or RBAC grants) until the
session is re-authenticated. (Offline/local work and the Box-credential proof did not need it.)

**Why you:** `az login` opens an interactive browser sign-in — an agent can't complete it.

**Steps:**
1. In this session, run **`! az login`** (the `!` prefix runs it here so the output lands in the chat), or
   run `az login` in your own terminal. Sign in with the account that owns `rg-collisionspike-dev`.
2. Confirm with `az account show` (should print subscription `e6076573-…`, state **Enabled**).
3. Once done, the agent can proceed with the staged Azure work — **Box activation (D2)** is the first thing
   ready to run end-to-end (see [docs/azure/box-activation.md](./azure/box-activation.md)).

#### A1. Upgrade the subscription off the Free Trial → Pay-As-You-Go  ·  *deadline*

**What:** subscription `e6076573-23a5-46a8-acef-7e22d264e5db` is an **Azure Free Trial**
(`quotaId = FreeTrial_2014-09-01`). At the ~**30-day** mark Azure **disables the entire stack** (SPA, both
Function Apps, Postgres, Key Vaults, Blob) unless it is upgraded.

**Why you:** only the account owner / billing admin can change the offer and add a payment method.

**Steps:**
1. In the Azure portal → **Subscriptions → (this subscription) → Upgrade** (or **Cost Management +
   Billing**) and convert the Free Trial to **Pay-As-You-Go**.
2. Confirm the **12-month free PostgreSQL Flexible Server allowance survives** the upgrade (it does — it is
   tied to PAYG, not to the trial).
3. After upgrade, re-check that all resources in `rg-collisionspike-dev` are **running** (nothing got
   suspended at the trial boundary).

> Until this is done, treat every other activation as **provisional** — the whole environment can be
> disabled at the trial deadline.

#### A2. Database-credential exposure & RLS  ·  ✅ **RESOLVED (2026-06-26)** — nothing for you to do

**Done:** the Data API (`cespk-api-dev`) no longer connects as the server administrator `csadmin`. It now
connects as a **non-owner application login `cespk_app`** (`rolsuper=false`, `rolbypassrls=false`), with its
password held as a **Key Vault reference** (`cespk-pg-kv-dev/cespk-app-password`, resolved by the Function
App's managed identity — **no cleartext**). Because `cespk_app` is not the table owner, the authored
**Row-Level Security is now enforced** (the prior `csadmin` connection bypassed it). The DB app-role is set
**per connection** via the libpq startup option `-c app.role=staff` (the `PGAPPROLE` app-setting). Grants are
least-privilege — **no DELETE on any table**, and `audit_event` is **INSERT/SELECT only** (append-only at
both the grant and RLS layers). _(The earlier `csadmin` cleartext-password leak was separately remediated by
rotating + Key-Vault-referencing `pg-admin-password`.)_

**Forward note:** a future admin-only destructive path (the ADR-0017 retention/erasure cascade — **not yet
implemented**) must run on a **separate** pool opened with `-c app.role=admin`, gated on a verified
`CollisionSpike.Superuser` token; do **not** widen the staff pool's role.

#### A3. Other plaintext secret exposures  ·  ✅ **RESOLVED (2026-06-27)** — nothing for you to do

**Done:** a full audit found three more plaintext exposures beyond the Postgres credential; all are now fixed.
- **`GRAPH_CLIENT_SECRET`** (`cespk-orch-dev`) was plaintext → **rotated** on the intake app registration
  (`5d37a155…`), stored in Key Vault (`cespk-pg-kv-dev/graph-client-secret`), and referenced via the orch
  **managed identity** (granted **Key Vault Secrets User** — it previously had zero role assignments).
  _(This closes B2 below.)_
- **Storage-account keys** (`AzureWebJobsStorage` + `DEPLOYMENT_STORAGE_CONNECTION_STRING`) on **both**
  `cespk-api-dev` and `cespk-orch-dev` → switched to **identity-based** storage
  (`AzureWebJobsStorage__accountName` + SystemAssignedIdentity deploy auth, matching the 6 retained apps);
  both connection strings removed; MIs granted **Storage Blob Data Owner** (orch also **Queue/Table Data
  Contributor** for Durable); `allowSharedKeyAccess=false` on both storage accounts.
- **`DOCINTEL_KEY`** (ocr) → Document Intelligence account `cespkdocintel-dev` **local-auth disabled** (key
  neutralized), ocr MI granted **Cognitive Services User** (keyless path), the plaintext setting blanked.
- **Retained function keys** (parser/enrich/box) moved to Key Vault (`parser-fn-key` / `enrich-fn-key` /
  `boxwebhook-fn-key`) and KV-referenced from orch (the parser host key was rotated).
- Only `APPLICATIONINSIGHTS_CONNECTION_STRING` (Microsoft: not a secret) and the platform-managed
  `WEBSITE_AUTH_ENCRYPTION_KEY` remain as plaintext config — acceptable, no action.

---

### B. Email intake is LIVE on the production mailbox set — finishing items only

> ✅ **Production mailbox cutover DONE (2026-06-29).** `cespk-orch-dev` runs **Microsoft Graph PUSH
> change-notification subscriptions** over the production set **info@ + engineers@ + desk@** (all
> Exchange-RBAC-scoped). Transport is **push, not delta-poll**. **B1 (Exchange-RBAC-scope info@ + desk@), B2
> (Graph secret in Key Vault) and B3 (deploy + wire orchestration) are DONE**; the test/dev mailbox digital@
> was de-scoped from config and its subscription deleted. ✅ **Renewal RESOLVED (2026-06-29):** subscriptions
> are kept alive by a **Durable eternal orchestration** (`subscriptionMonitorOrchestrator`) — a durable timer
> wakes the scale-to-zero FC1 app, which a plain NCRONTAB timer can't; the `graph-renew` timer is retained
> only as a backstop. **Remaining (finishing items, do not block intake):** confirm an **unattended renew** at
> the next ~6h durable-timer wake; set **`EVIDENCE_BLOB_CONNECTION`** (prefer MI); assign the **orch MI an
> app-role on the Data API**; wire **Azure Monitor heartbeat alerts**; add a subscription-**prune** step (a
> mailbox removed from `GRAPH_INTAKE_MAILBOXES` is not yet auto-deleted — why digital@ had to be removed by
> hand). Residual `graph-webhook` `499`/cold-start aborts remain (Graph retries absorb the misses). The design
> is authorised by **Exchange RBAC for Applications** (resource-scoped, **no Global-Admin consent**) layered
> with **Graph PUSH subscriptions**.

#### B1. Exchange-RBAC-scope the production mailboxes (info@ + desk@)  ·  ✅ **DONE (2026-06-29)** — nothing for you to do

**Done:** info@ + desk@ are now Exchange-RBAC app-read scoped (scope `CollisionSpike-Intake-Prod`,
`Application Mail.Read`) alongside engineers@; their Graph push-subscription creates succeeded (200) once the
~30min–2h Exchange-RBAC permission cache cleared (the earlier 403s were the cache, not a wrong grant). The
production set **info@ + engineers@ + desk@** is fully scoped + subscribed; the test/dev mailbox digital@ was
de-scoped from intake config and its subscription deleted. _(Original operator steps retained for reference.)_

**What (for reference):** the intake app must read the production mailboxes via **Exchange RBAC for
Applications** so the grant is **scoped to just those mailboxes** — *not* tenant-wide `Mail.Read`.

> **This supersedes any older note that "Graph `Mail.Read` needs Global-Admin / admin consent"** — it does
> **not**: an **Exchange Administrator** grants resource-scoped Graph mailbox access. (It also supersedes the
> old "delta-poll / no push subscription" wording — the **live transport is Graph PUSH subscriptions**.)

**Steps (for reference — Exchange Online PowerShell, as an Exchange Administrator):**
1. **`New-ServicePrincipal`** — register the intake app's Entra service principal in Exchange.
2. **`New-ManagementScope`** — define a scope covering the production mailboxes (info@ + engineers@ + desk@).
3. **`New-ManagementRoleAssignment`** — assign the app the Graph mailbox role (e.g. `Application Mail.Read`)
   **bounded by that scope**, so it can read only those mailboxes and nothing else.
4. Note the exact SMTP addresses — they go into `GRAPH_INTAKE_MAILBOXES` in B3.
   > ⏳ **Footgun:** after the grant, leave the app **idle ≥30 min** before the first Graph call — polling
   > keeps the permission cache stale (the 403 that wasted ~50 min in this very cutover).

#### B2. Put the Graph client secret in Key Vault  ·  ✅ **DONE (2026-06-27)** — nothing for you to do

**Done:** the Graph client secret was **rotated** on the intake app registration (`5d37a155…`), stored in
Key Vault (`cespk-pg-kv-dev/graph-client-secret`), and referenced from `cespk-orch-dev` via the orchestration
Function App's **managed identity** (granted **Key Vault Secrets User**); the plaintext setting was removed and
the reference resolves. _(Original operator steps retained for reference below.)_

**What:** the intake app authenticates to Graph with a **client secret** (or certificate). It must live in
**Key Vault**, not in app settings.

**Why you:** creating/rotating the Entra app credential and writing it to Key Vault are privileged.

**Steps (for reference):**
1. In the intake app's **Entra app registration**, create a **client secret** (or upload a certificate).
2. Store it as a secret in the appropriate **Key Vault** (the retained vaults are still in
   `rg-collisionspike-dev`).
3. Reference it from `cespk-orch-dev` app settings via a **Key Vault reference**
   (`@Microsoft.KeyVault(...)`) resolved by the orchestration Function App's **managed identity** — never
   paste the secret value into config.

#### B3. Deploy the orchestration Function App and wire it up  ·  ✅ **DEPLOY + WIRE DONE (2026-06-27)** — a few finishing items remain

**Done:** `cespk-orch-dev` has the full intake chain deployed and registered (live function count in the
registry [architecture/live-environment.md](./architecture/live-environment.md)):
fetchMessage/providerMatch/caseResolve/classifyPersist/parse/statusEvaluate/enrich + intakeOrchestrator +
intake-starter; Graph infra graph-webhook/graph-lifecycle/graph-renew; and all 9 gated orchestrations + their
activities/starters/timers). _(Root cause of the earlier "0 functions" state: the esbuild ESM→CJS bundle
crashed on load at `createRequire(import.meta.url)`; fixed with a banner+define build step `build-orch.cjs`.)_
Wired: PARSER/ENRICH/BOXWEBHOOK/EVASENTRY `_FN_URL` + KV-referenced function keys, `EVIDENCE_BLOB_CONTAINER`;
orch→Data API uses **managed identity**; storage is identity-based. **Email intake is LIVE** — Graph PUSH
subscriptions over the production set info@ + engineers@ + desk@ (mailbox cutover finished 2026-06-29).

**Finishing items (do not block intake):** set **`EVIDENCE_BLOB_CONNECTION`** (prefer a managed-identity
form — currently unset to avoid a plaintext secret); assign the **orch managed identity an app-role on the
Data API**; wire **Azure Monitor heartbeat alerts**; add a subscription-**prune** step. ✅ Graph renewal is
RESOLVED (2026-06-29): the durable `subscriptionMonitorOrchestrator` keeps the subscriptions renewed (the
`graph-renew` timer never fired on Flex scale-to-zero — now a backstop).

**What:** publish the orchestration code to `cespk-orch-dev` and set the env it needs to poll Graph and call
the existing Functions.

**Why you:** deploying code to a live Function App and setting its production app settings are deploy/login
actions.

**Steps (for reference — deploy + wire already done):**
1. **Deploy** the orchestration project (`orchestration/`) to **`cespk-orch-dev`** (this deploy is what
   created the live functions / the intake chain).
2. Set app settings:
   - **`GRAPH_INTAKE_MAILBOXES`** — the intake mailboxes as **JSON** `[{mailbox,minIntakeDate}]` (it had been
     a plain string that JSON-parse-failed to **zero** mailboxes; now fixed). **Currently set** to the
     production set `info@` + `engineers@` + `desk@collisionengineers.co.uk` (cutover finished 2026-06-29; the
     test/dev mailbox `digital@` was removed). ⚠️ A mailbox removed here is not yet auto-pruned from Graph —
     delete its subscription by hand until the prune step lands (see the finishing items above).
   - the **parser** Function base URL **+ function key** (`cespike-parser-dev`),
   - the **enrichment** Function base URL **+ function key**,
   - the Entra **tenant id / intake app client-id**, and the **Key Vault reference** to the Graph client
     secret (from B2).
3. Confirm a push notification fires (graph-webhook) and a test email lands as a **Case** (status `new_email → ingested`), provider
   matched by sender domain, and the EVA fields pre-fill with provenance.

#### B4. Activate Outlook filing ("Suggested action" → real move)  ·  *the RBAC cache wait + your live test*  ·  **gate flip DONE + Exchange grant DONE 2026-07-03; operator live-test next**

**What:** the inbox's "Suggested action" column can genuinely FILE an email into the suggested
Outlook folder (e.g. `Inbox/Instructions`) inside the shared mailbox. SPA button → Data API
`POST /api/inbound/{id}/outlook-move` → `outlook-move` storage queue → orchestration mover (Graph
`/move`, creating the destination folder when missing) → outcome stamped back on the row + audit.

**✅ Steps 1 + 3 are DONE (2026-07-03, user-instructed):** `OUTLOOK_MOVE_ENABLED=true` is set on
**both** `cespk-api-dev` and `cespk-orch-dev` (the SPA's "File to …" buttons are live), and the
**`Application Mail.ReadWrite` Exchange-RBAC grant landed** the same day. **Only the cache wait
(step 2) and your live test (step 4) remain.** A move clicked before the ~30 min–2 h Exchange
permission cache clears may still **403** and report `failed` — retry after the wait.

**Why you:** the mover needs **`Application Mail.ReadWrite`** via **Exchange RBAC for Applications**
on the intake mailboxes — a permission grant only you can make. **You also asked to live-test this
yourself — no automated live move test will be run.**

**Steps:**
1. ✅ **DONE (2026-07-03)** — `Application Mail.ReadWrite` assigned on **both** read scopes
   (`CollisionSpike-Intake-Prod-MailReadWrite` covering info@ + desk@ [+ engineers@], plus
   `CS-Intake-EngDigital-MailReadWrite` twinning the legacy scope), via
   `C:\Users\Alex\grant-exo-rbac-readwrite.ps1` (device-code sign-in). Verified:
   `Test-ServicePrincipalAuthorization` shows **Mail.ReadWrite InScope=True** for all three
   production mailboxes. The `Mail.Read` assignments were kept.
2. ⏳ **PENDING** — **wait for the Exchange-RBAC permission cache** (~30 min–2 h, same as the B1
   cutover; leave the app idle rather than polling).
3. ✅ **DONE (2026-07-03)** — gate flipped: `OUTLOOK_MOVE_ENABLED=true` on **both** `cespk-api-dev`
   and `cespk-orch-dev`. (The API also needs `OUTLOOK_MOVE_QUEUE_SERVICE_URL` + its MI holding
   `Storage Queue Data Message Sender` on the orch storage account — wired at deploy time; see the
   registry.)
4. ⏳ **PENDING — live-test yourself** once steps 1–2 land: click "File to …" on a test row in the
   inbox; the email should move in Outlook, the row should read "Filed to …" and flip to Handled,
   and `audit_event` should carry `outlook_move_requested` → `outlook_moved`. Record the result in
   [tickets/TKT-054-ui-work/verification.md](./tickets/TKT-054-ui-work/verification.md).

---

### C. Staff access

#### C1. Assign staff app roles on the Data API  ·  *~5 min per person*

**What:** the SPA/API authorise staff via two enforced Entra **app roles** — **`CollisionSpike.User`** and
**`CollisionSpike.Superuser`** (these map one-to-one to the two old Dataverse security roles).
**`CollisionSpike.Superuser`** is the full-privilege role, **renamed from `CollisionSpike.Admin`** (same
app-role id, so any existing assignment carried over; the API still accepts the legacy `CollisionSpike.Admin`
for back-compat). A third role **`CollisionSpike.Engineer`** is **defined but not yet enforced** — don't
assign it for access yet. Right now **only one** staff principal is assigned; **everyone else gets `403`**
until you assign them.

**Why you:** assigning enterprise-app roles to users is an Entra directory operation only an admin can do.

**Steps:**
1. In Entra → **Enterprise applications** → the app that exposes these roles (the `cespk-api-dev` /
   `CollisionSpike` API registration; v2 tokens carry `aud` = the API client-id GUID `fa2fb28c…`).
2. **Users and groups → Add user/group**, pick each staff member, and assign **`CollisionSpike.User`**
   (or **`CollisionSpike.Superuser`** for full-privilege admins).
3. Have each person sign out/in so a fresh token carries the role, then confirm they can load the app
   without a `403`.

---

### D. Retained integrations & business data (domain unchanged; mechanism is now Azure)

#### D1. Switch on EVA submission  ·  *you supply the login*

**What:** the EVA Functions (`evasentry`, `evavalidation`) are deployed but **submission is switched off**
with no login stored. The current export path is **drag-drop 12-field JSON** into EVA; the **Sentry REST**
path stays gated because Minotaur's Sentry API accepts only **one principal code** per submission (it can't
route different work-provider codes) — REST waits on Minotaur's patch.

**Why you:** EVA's **test** Client ID/Secret are yours.

**Steps:**
1. Provide the EVA **test** Client ID + Client Secret (or place them in the EVA Function's **Key Vault**
   yourself — they live in Key Vault, never in code).
2. Flip the EVA feature flag **on** in the **test** environment only.
3. Submit one test case and confirm EVA accepts it — **photo order** must be **2 preview photos first
   (vehicle overview + main-damage closeup), then all photos in sequence including those two again**, with
   the **full registration visible** on the overview.
4. Only after the test passes do you point it at **live** EVA.

#### D2. Box filing  ·  ✅ **LIVE (2026-06-28)** — only the two Box-side artifacts remain (see #4 / OPERATOR-CHECKLIST)

**What:** the **`box-webhook`** Function (one of the 6 retained Python Functions; deployed) files cases to
Box (mint the Case/PO folder, copy the upload File Request, mirror the finished case) using a **service
identity** — the Function mints its own Box token from a stored secret. Box is an **additive, one-way
mirror; Postgres stays the system of record**; **evidence is linked, not embedded** (a server-minted "Open
in Box" deep link — no iframe / no CSP `frame-src` edit).

**Status (2026-06-28):** the Box app uses **JWT "Server Authentication"** (not CCG). You generated a fresh
keypair and dropped the complete `Config.JSON` at the repo root (`941197__config.json`, gitignored). It was
**verified end-to-end against `api.box.com`** — token mint **HTTP 200** + an authenticated
`GET /2.0/folders/392761581105` **HTTP 200**. So the **app is registered + Admin-authorized** (no
reauthorization needed) and the **Service Account is already a collaborator** on the allowed root. The Box
tenant is clearly Business-or-higher (JWT + the folder all work). **The hard parts are done.**

**Now live:** the `Config.JSON` is in Key Vault (`cespkboxkvv76a47/box-config-json`) and the `BOX_*` gates
(`BOX_API_ENABLED` / `BOX_FOLDER_AT_INTAKE_ENABLED` / `BOX_FILEREQUEST_ENABLED`, `BOX_FOLDER_ROOT_ID=392761581105`)
are **true** on `cespk-api-dev` + `cespk-orch-dev`; an authed smoke call returned **200** (folder `CCPY26050`).
Runbook: **[docs/azure/box-activation.md](./azure/box-activation.md)**. The remaining *Box-side*
follow-ups (operator, not blockers for basic filing) are the **hand-built template File Request** id and
subscribing the **`FILE.UPLOADED` webhook** — both covered in that runbook (§5).

> The one empirical unknown that still wants a live exercise: does a **File-Request upload fire
> `FILE.UPLOADED`** → the Function → the case advances? On a transient miss the recovery is Box's own retry
> (the receiver returns non-2xx so Box re-delivers). Design history:
> [plans/phase-7-box-integration/box-integration-activation.md](./plans/phase-7-box-integration/box-integration-activation.md).

#### D3. Provider auto-matching — the missing business domains  ·  *you supply the data*

**What:** cases are auto-tagged with the right provider **by the sender's email domain**. The provider
corpus is seeded into Postgres (`work_provider` = 390). Verified domains for **32 providers** were loaded
previously (ambiguity-guarded — a domain serving >1 active provider is never used as a match key; it goes
through the intermediary path).

**✅ Six domains corrected (2026-07-03, user-approved).** Seed `916_provider_domain_corrections.sql`
Section A is applied live: **FW** → `fairwaylegal.co.uk`, **TEN** → `tenlegal.co.uk`, **AX** → `ax-uk.com`,
**BC** → `bakercoleman.co.uk`, **DFD** → `dfd-solicitors.co.uk`, **BLACK** → `blackstone-legal.co.uk`. A
**PHA (Parkhouse) insert stays commented out** in the same seed — it needs your confirmation of the correct
**principal code** before it can land.

**What's left for you:** the remaining domainless providers — **Fairway, Regent, Castle, Stallion, Relay**,
etc., minus whichever of these the six corrections above already cover — plus the public-domain case
(**NETWORK HD UK / YM Law → `gmail.com`**) still need your data. Send the real business domain for each (or
confirm there isn't one) and it gets added to the provider's domain field in Postgres, and confirm the
**PHA/Parkhouse principal code** so its insert can land too. *(In the decommissioned stack this was the
Dataverse `cr1bd_knownemaildomains` column.)*

#### D4. Add extra reference info  ·  *you supply the data*

**What:** a few reference lists would improve matching and inspection-location suggestions (provider-code
corrections, garage↔provider links, address lists, etc.).

**Why you:** this is information only the business has.

**Steps:** gather whatever you have (partial is fine) and send it over to be loaded into Postgres.

#### D6. Rules Engine v2 — queued operator gates  ·  *items 2 and 3 done; items 1, 4, 5 remain open*

**What:** the [rules-engine-v2 plan](./plans/rules_engine_v2_plan_9ba034c4.plan.md) (email
categorisation/triage upgrade — ROADMAP Phase 8's Azure-era realization) carries five operator gates.
Items 2 and 3 are now done; the rest are listed here so nothing lands as a surprise:

1. **Sibling PR merge + first engine tag** (Phase 0; ADR-0018 prereq): merge `cedocumentmapper_v2.0`
   **PR #4**, close **PR #5** as superseded (strict subset), tag the engine release (the sibling's
   first tag) so the vendored copy can be re-cut against a committed ref.
2. **Phase-2 DDL delta apply** (live Postgres) · ✅ **DONE (2026-07-03).** The append-only taxonomy rows
   (`case_update`, `cancellation`, `images_received`) + `inbound_email.body_jobref` / `conversation_id`
   columns are **applied live** — see **D7** below for the verification detail. The **third**, unrelated
   delta — the Phase-4 `ai_suggestion.embedding` column (DDL only, no live wiring yet) — rode the **same
   apply session** and is also applied; see D7's own note below.
3. **`EMAIL_AI_ENABLED` production flip** · ✅ **DONE (2026-07-03, user-instructed) — this session's
   user message is the sign-off.** The app settings are now live on `cespk-orch-dev`:
   `EMAIL_AI_ENABLED=true`, `AI_MODEL_ENDPOINT=https://digital-3339-resource.cognitiveservices.azure.com`,
   `AI_MODEL_DEPLOYMENT=gpt-5`. The AOAI structured-output client (`orchestration/src/lib/aoai.ts`),
   the `triageClassify` activity, the post-classify orchestrator wiring (abstain/`uncorroborated_*`
   rows only), and the extended `ai_suggestion` `'triage_category'` suggest/accept lifecycle are all
   **acting live**. The known spec gap below was **closed and deployed first**, before the flip.
   - **App settings — ✅ SET (2026-07-03).** All three are read via the shared `@cs/domain/gates`
     (`emailAi()` / `aiModelEndpoint()` / `aiModelDeployment()`) on `cespk-orch-dev` (the app that
     makes the model call).
   - **RBAC grant — ✅ APPLIED (2026-07-02):** the orch app's managed identity holds
     **Cognitive Services OpenAI User** on `digital-3339-resource` (role assignment
     `d695d697-ba96-42c4-a958-3cd61d868bb0`, applied via ARM and verified — see the registry's
     `foundry.miGrants`). Keyless by design — no key app-setting exists to set.
   - **⚠️ Known spec gap — ✅ CLOSED (2026-07-03, deployed before the flip):** the plan's "honour
     `work_provider.ai_allowed`" check is now **implemented** in the AOAI activity (alongside the PII
     scrub, content-filter→abstain, model-version stamping and suggestion-only posture that were
     already there) — an explicit `false` on `work_provider.ai_allowed` skips the model call with
     reason `provider_ai_opt_out`; the column was confirmed present live before the flip.
   - **Foundry keyless flip** (disable local/key auth on the account) is **not required** for
     `EMAIL_AI_ENABLED` to work (the managed-identity token works regardless of whether key auth is
     ALSO still enabled) — it remains a separate, still-open item; tracked as item 5 below, your
     confirmation either way.
   - **Data residency, named plainly** (unchanged fact, restated per-gate as the plan requires): the
     chat model is a **Global deployment** (inference may process outside the UK; data-at-rest stays
     in-region; no UK data zone exists for gpt-5 in this region).
   - **The gate itself, verbatim from the plan**: "the `EMAIL_AI_ENABLED` **production** flip is gated
     on the **G5 per-AI-gate sign-off**" — **satisfied 2026-07-03**: your explicit instruction in this
     session to flip `EMAIL_AI_ENABLED` on production is the **E2** per-AI-gate production sign-off
     (the general E2 policy/legal inputs below remain open for the *other*, non-AI items — retention,
     lawful basis, litigation-hold, ICO/DVLA).
   - **A/B evidence that informed the decision**: `scripts/eval-email/run_ab.py` (Phase 4) ran a
     live 3-item smoke test against `gpt-5` on 2026-07-02 (`--with-llm --deployment gpt-5 --limit 3`)
     — 0 abstains, every response matched the strict-JSON contract; `--deployment gpt-5-mini`
     correctly fails honestly (`http_404_DeploymentNotFound`) — that model is not deployed on
     `digital-3339-resource` (only `gpt-5` and `text-embedding-3-large` are; see the registry).
4. **Live `inbound_email` PII export** for the eval corpus (Phase 1): an E2-governed export of real
   email rows + staff overrides into the gitignored corpus path. This also unblocks the Phase-4
   embedding prior (`ai_suggestion.embedding`, DDL-only as of this build — see D7's note): that column
   stays unpopulated until this export exists, per the plan.
5. **Foundry keyless flip** (Phase 4): after the orchestration MI is granted access, disabling
   key-based auth on `digital-3339-resource` needs your confirmation — **you created that account**
   (2026-07-01) and may have key-based uses for it outside this repo. Current state: the registry
   ([live-environment.md](./architecture/live-environment.md)).

All five also depend on the standing **A0** (`az login`) and **A1** (Free-Trial→PAYG) items above.

#### D7. Apply the rules-engine-v2 taxonomy DDL delta  ·  ✅ **APPLIED LIVE (2026-07-03)** — nothing for you to do

**Done:** applied live via Entra `digital@` → `SET ROLE csadmin` and verified: `choice_inbound_category`
100000005 (`case_update`) / 100000006 (`cancellation`); `choice_inbound_subtype` 100000010–12
(`images_received` / `cancellation_notice` / `update_general`); `inbound_email.body_jobref` /
`conversation_id` columns present. This **unblocked** the taxonomy-v2 parser/orchestration engine deploy
(now redeployed — see below) and the `TRIAGE_*` gate flips (now all `true` on `cespk-orch-dev`). The
Phase-4 `ai_suggestion.embedding` DDL-only delta (see the note at the foot of this item) rode the same
apply session. Full verification detail: `LIVE_FACTS.json` `verifiedBy` (2026-07-03 second-wave entry).
_(Original operator steps retained below for reference / re-run safety — every statement is idempotent.)_

**What (for reference):** the Phase-2 additive taxonomy DDL for the [rules-engine-v2 plan](./plans/rules_engine_v2_plan_9ba034c4.plan.md)
is authored and checked in at
[`migration/assets/schema/deltas/2026-07-02-rules-engine-v2-taxonomy.sql`](../migration/assets/schema/deltas/2026-07-02-rules-engine-v2-taxonomy.sql)
(see [`deltas/README.md`](../migration/assets/schema/deltas/README.md) for the canonical-vs-delta
convention). It adds, all idempotent/additive (`ON CONFLICT DO NOTHING` / `IF NOT EXISTS`
throughout, one `BEGIN…COMMIT`):
- **`choice_inbound_category`** +2 rows — `case_update` (100000005), `cancellation` (100000006).
- **`choice_inbound_subtype`** +3 rows — `images_received` (100000010, plan-named), plus two
  minimal completions `cancellation_notice` (100000011) and `update_general` (100000012) so the two
  new categories each have a subtype to land on (flagged in the file for your review at apply time).
- **`choice_audit_action`** +4 rows — `inbound_link_suggested`/`inbound_linked`/`inbound_detached`
  (100000035–37) and `cancellation_proposed` (100000038).
- **`inbound_email`** +2 columns (`body_jobref`, `conversation_id`) + 2 partial indexes.

The companion canonical files (`migration/assets/schema/000_enums_lookups.sql` and
`120_inbound_email.sql`) already carry the same rows/columns, so a fresh rebuild lands at the same
state — this item is only about applying the delta to the **already-live** database.

**Why you:** this is a live schema change on the system of record (Postgres `cespk-pg-dev`) — an agent
authors DDL but does not run it against a live database. The [plan](./plans/rules_engine_v2_plan_9ba034c4.plan.md)
marks the Phase-2 DDL apply as operator-gated, same discipline as the 2026-06-30 `ai_suggestion`
migration. It is also a **deploy-order gate**: `inbound_email.category_code` / `subtype_code` (and their
`suggested_*` twins) carry FK `REFERENCES` to the two choice tables, so deploying the taxonomy-v2
parser/orchestration engine (tag `engine-v2.2`) **before** this delta lands would make its
classify-persist writes fail closed the moment the new engine emits `case_update`/`cancellation` or
one of the three new subtypes.

**Steps** (mirrors the 2026-06-30 `ai_suggestion` delta apply — full detail + verification queries are
in the delta file's own header comment):
1. `az login` — sign in as the Entra principal that is `cespk-pg-dev`'s Microsoft Entra admin (live as
   `digital@collisionengineers.co.uk`, mapped to the server's `azure_pg_admin` role).
2. Add a transient firewall rule for your workstation IP:
   `az postgres flexible-server firewall-rule create -g rg-collisionspike-dev -n cespk-pg-dev
   --rule-name OperatorBuildHost --start-ip-address <your-ip> --end-ip-address <your-ip>`.
3. Connect with an Entra token and become the table owner (the app login `cespk_app` doesn't own the
   tables and can't run DDL; `csadmin` does and bypasses RLS):
   `PGPASSWORD=$(az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv)
   psql "host=cespk-pg-dev.postgres.database.azure.com port=5432 dbname=collisionspike sslmode=require
   user=digital@collisionengineers.co.uk" -v ON_ERROR_STOP=1`, then at the prompt `SET ROLE csadmin;`.
4. Apply it: `\i migration/assets/schema/deltas/2026-07-02-rules-engine-v2-taxonomy.sql` (safe to
   re-run — every statement no-ops if it has already landed).
5. Run the verification queries from the delta file's header (row checks on the three choice tables,
   `\d inbound_email` for the two new columns + their indexes).
6. Remove the transient firewall rule: `az postgres flexible-server firewall-rule delete -g
   rg-collisionspike-dev -n cespk-pg-dev --rule-name OperatorBuildHost --yes` (only
   `AllowAzureServices` should remain).

> **Blocks — ✅ CLEARED (2026-07-03).** This delta is now confirmed live, in the correct order: the
> taxonomy-v2 parser/orchestration engine was redeployed (3 parser functions re-verified) **after** this
> delta landed, and all four `TRIAGE_*` app-setting gates (`TRIAGE_REF_GATE_ENABLED`,
> `TRIAGE_CANCELLATION_ENABLED`, `TRIAGE_IMAGES_ROUTING_ENABLED`, `TRIAGE_CASE_UPDATE_ENABLED`) are now
> `true` on `cespk-orch-dev` — see the DEPLOY-ORDER WARNING in the delta file itself for why the sequence
> mattered.

> **A third delta now rides this same apply session** (Phase 4, authored 2026-07-02):
> [`2026-07-02-rules-engine-v2-embedding.sql`](../migration/assets/schema/deltas/2026-07-02-rules-engine-v2-embedding.sql)
> adds `ai_suggestion.embedding double precision[]` — DDL only, no deploy-order coupling to anything
> (unlike this delta, it gates no engine tag or app-setting: nothing in the repo reads or writes the
> column yet). If you are already connected as `csadmin` for D7/D8, just also run `\i
> migration/assets/schema/deltas/2026-07-02-rules-engine-v2-embedding.sql` before dropping the
> transient firewall rule — see that file's own header for the one-line verification query. The
> column stays unpopulated until the D6 #4 live `inbound_email` PII export exists (the plan's stated
> precondition for the embedding prior).

#### D8. Apply the rules-engine-v2 identification seed delta  ·  ✅ **APPLIED LIVE (2026-07-03)** — nothing for you to do

**Done:** applied live via Entra `digital@` → `SET ROLE csadmin` and verified: the Connexus `image_source`
intermediary row + its `imagesource_workprovider` links to PCH/SBL, and PCH's `known_email_domains` now
carries `pch-ltd.com`. This **unblocks** live routing for TKT-021 (Connexus → PCH/SBL) and TKT-051 (PCH
doc-content + `@pch-ltd.com` senders) — both now just await a live-occurrence probe (see
[docs/tickets/BOARD.md](./tickets/BOARD.md)). Full verification detail: `LIVE_FACTS.json` `verifiedBy`
(2026-07-03 second-wave entry). _(Original operator steps retained below for reference.)_

**What (for reference):** the Phase-3 identification seed delta for the [rules-engine-v2 plan](./plans/rules_engine_v2_plan_9ba034c4.plan.md)
(ADR-0011, implemented as written) is authored and checked in at
[`migration/assets/schema/deltas/2026-07-02-rules-engine-v2-identification.sql`](../migration/assets/schema/deltas/2026-07-02-rules-engine-v2-identification.sql).
Unlike **D7** this is **pure data** — no new columns/tables/choice codes (`image_source`,
`imagesource_workprovider`, and `work_provider.known_email_domains` are all already live), so there is
**no deploy-order coupling** to any engine tag or app-setting gate. It:
- Inserts one `image_source` row for **Connexus** (`kind=intermediary`, domain `connexus.co.uk`).
- Links it N:N to **PCH** and **SBL** in `imagesource_workprovider` (resolved by `principal_code`; skips
  silently if a code turns out to be missing from the live corpus — verify with the delta's own header
  queries).
- Appends `pch-ltd.com` to **PCH**'s own `known_email_domains` (TKT-051: PCH's direct senders were
  unrecognised).
- Defensively removes `connexus.co.uk` from any `work_provider.known_email_domains` it might already
  carry (ADR-0011: an intermediary domain must never direct-match a single provider) — a no-op unless it
  is actually present; this could **not** be verified offline (the seed CSVs `910_seed_corpus.sql`
  `\copy`'s from are not checked into this repo), so the statement is written to be safe either way.

**Why you:** same reason as D7 — a live data change on the system of record (Postgres `cespk-pg-dev`)
needs the table owner (`csadmin`) and an RLS bypass (`image_source` / `imagesource_workprovider` /
`work_provider` all carry `FORCE ROW LEVEL SECURITY`) that an agent session does not carry.

**Steps:** identical connection/runbook to D7 (`az login` → transient firewall rule → connect as the
Postgres Entra admin → `SET ROLE csadmin` → `\i` the file → run its header's verification queries → drop
the firewall rule). See the delta file's own header for the exact commands.

**Unblocked (not merely "unblocks" — now live):** TKT-021 (Connexus no longer resolves as a bare "new
enquiry" when its content names PCH/SBL), TKT-051 (PCH doc-content **and** `@pch-ltd.com` senders both
recognised), and TKT-028's residual (a content-detected provider now resolves a real `work_provider_id`,
not just the free-text EVA field) are all live as of this delta's 2026-07-03 apply. The API/orchestration
code that reads this corpus (the extended `GET /api/internal/provider-match-records`, `@cs/domain`'s
`matchSenderIdentity`, and `applyParserFields`'s content-string mapping) was already deployed-safe before
this delta landed — it degraded to today's behaviour (an empty intermediary/candidate list) until then.

#### D9. Deactivate the EVA work-provider row  ·  *you confirm the pre-check, then one delta*

**What:** EVA (Exclusive Vehicle Assessors) is **not a work provider** — it is an engineering firm whose
reports CE **audits** (the third-party original on a PCH/QDOS audit case). It was logged in the provider
corpus anyway (a legacy Dataverse-era row), which is one leg of the TKT-051 "cases arriving as EVA
(Engineers)" mislabel. The code legs are fixed in the repo (parser `engine-v2.6` no longer emits an
engineer-report layout name as `work_provider`; the Data API denylists those names in
`api/src/lib/parser-eva-fields.ts`); this item closes the **data** leg. Delta:
[`migration/assets/schema/deltas/2026-07-03-deactivate-eva-work-provider.sql`](../migration/assets/schema/deltas/2026-07-03-deactivate-eva-work-provider.sql)
— **deactivates** (never deletes) any active row whose `display_name` matches
`%exclusive vehicle assessors%` / `%eva (engineers)%`, and empties its match domains.

**Why you:** (1) the same owner/RLS runbook as D7/D8 (a live Postgres data change needs `SET ROLE csadmin`);
(2) a **judgment pre-check** — run the delta header's SELECT first and eyeball the hits: the WHERE is
deliberately keyed on the full firm names, not the bare code `EVA`, so an innocent provider whose code
merely collides is untouched; if the SELECT surfaces something surprising, adjust before applying.

**Steps:** identical connection/runbook to D7/D8 (`az login` → transient firewall rule → connect as the
Postgres Entra admin → `SET ROLE csadmin` → run the header pre-check SELECT → `\i` the file → run its
POST-CHECK → drop the firewall rule). Pure data, idempotent, no deploy-order coupling.

#### D10. Audit/case-type activation — delta first, gate flip later  ·  *two-step*

**What:** the ADR-0021 case-type work (audit `A.` / total-loss audit `AP.` / diminution `D.` Case/PO
markers, PCH+QDOS allowlist, `engineer_report` evidence) is code-complete and **shadow-safe**: with
`AUDIT_CASES_ENABLED` unset/false (today), intake behaves exactly as before and merely records an
**observe-only audit_event** whenever audit/diminution signals fire. Activation is two separate steps:

1. **Apply the choice-row delta** (any time — safe while the gate is off):
   [`migration/assets/schema/deltas/2026-07-04-audit-case-type-taxonomy.sql`](../migration/assets/schema/deltas/2026-07-04-audit-case-type-taxonomy.sql)
   — adds `choice_case_type` rows `audit_total_loss` + `diminution` and reasserts
   `choice_evidence_kind engineer_report` (100000007). Same D7/D8 runbook (`SET ROLE csadmin`,
   idempotent, `ON CONFLICT DO NOTHING`).
2. **Flip the gate — ONLY after (a) the delta is applied and (b) you have reviewed the shadow
   audit_events** (a few days of `Case-type '…' detected (observe-only…)` rows looking right):
   `az functionapp config appsettings set -g rg-collisionspike-dev -n cespk-api-dev --settings AUDIT_CASES_ENABLED=true`
   and the same on `cespk-orch-dev`. From then on: detected audits set `case_type_code`, standalone
   PCH/QDOS audits mint from the marker's own sequence (`A.PCH26001`…), QDOS dual "report + audit
   report" letters keep the standard number with case-type `audit`, and report-typed attachments
   persist as `engineer_report` evidence.

**Why you:** the delta needs the D7/D8 owner runbook; the gate flip is a business go-live decision
that should follow your review of the shadow events (flipping first + delta-missing would FK-fail
case creation for audit emails — the deploy-order note is in the delta header).

**Order with the parser deploy:** parser-first is safe (the new `case_type` envelope is additive and
ignored until the gate is on); the delta is only mandatory **before the gate flip**.

#### D5. Rotate the parser Function key  ·  *soft security item*

**What:** a parser **function key** value was once committed in source + a doc (both removed/scrubbed), but
a doc-scrub leaves it in **git history**. The only true fix is to **regenerate the key in Azure** (Function
App `cespike-parser-dev` → App keys), then **update wherever it is consumed** — i.e. the parser URL+key
that the orchestration Function App holds (B3). Low urgency (dev key), but worth doing before any prod use.

---

### E. Storage hardening & policy/legal (platform-agnostic — still required)

#### E1. Harden the evidence store before any purge/disposition is armed

**What:** the live evidence-bytes store **`cespkevidstdev01`** (the `evidence` container) needs
**blob soft-delete + versioning + container-delete-retention**, and the **Key Vaults** need
**purge-protection**, *before* any deletion/retention process runs against it.

**Why you:** applying data-protection settings on the live storage account / vaults is a privileged live
change — and it is the **hard pre-step** before any case-disposition or blob-purge job is enabled, or a
wrong disposal is unrecoverable.

#### E2. Policy / legal inputs  ·  *business/legal decisions only you can make*

These keep the data-protection posture open until you supply them (they were tracked as ADR-0017 inputs):

- the **retention period** (and the anonymise-vs-hard-delete policy),
- the **lawful basis** for DVSA/DVLA enrichment + valuation,
- the **litigation / legal-hold** rule,
- **ICO registration** + DVLA data-use terms,
- the **per-AI-gate production sign-off** (AI **testing** on repo data is already authorised; only
  production use awaits sign-off).

The DSAR/erasure runbook and the DPIA/controller-processor doc are authored and wait on these inputs.

---

## A note on "credentials"

Where this file says "give me the login/key," those are normal service keys (DVSA, DVLA, Box, EVA) plus the
two Azure-side secrets (the Postgres app login from A2 and the Graph client secret from B2). DVSA/DVLA keys
are already in place and working; the **two Azure secrets (A2 + B2) are now both resolved** (see A2 / A3 / B2).
**Box is live** (only the two Box-side artifacts remain — D2); **EVA** still waits on you; and the remaining
live-stack ask to extend intake to the production mailbox set is the **info@ + desk@ mailbox grant (B1)**.

---

---

## Historical — Power Platform operator backlog (deprovisioned 2026-06-27)

> **BANDED / NOT LIVE.** Everything below describes the **prior Power Platform implementation** (Power Apps
> Code App, Dataverse, the ~16 Power Automate flows, the custom connectors), which has been **migrated off
> to Azure** and **deprovisioned 2026-06-27** (the Dev sandbox deleted via `pac admin delete`).
> It is retained for provenance and for the **domain knowledge** it carries (EVA
> photo order, provider corpus specifics, the Box pivot design, retention/legal inputs). **Do not action
> these steps** — the live operator surface is the Azure sections above. Any `make.powerautomate.com`,
> `pac code`, Dataverse env-var, or custom-connector step here is **superseded**.

### (historical) Phase 8 — Inbox / Triage Management

Built offline against Dataverse (`cr1bd_inboundemail` triage table, the `triage-classify` flow, an
`/inbox` screen). It turned the inbox flow into "classify **every** email → route work to Cases, everything
else to a triage queue." **The triage-first intake *concept* carries forward** into the Azure orchestration
intake design; the Dataverse/Power-Automate **activation mechanics** (`pac code add-data-source`, rebinding
child flows, flipping a trigger per inbox) are decommissioned. Design rationale: ADR-0015.

### (historical) §1 Check the email inbox still works

Sent a test email to `digital@collisionengineers.co.uk` and confirmed a new Case appeared via the Power
Automate **CS Intake (shared mailbox)** flow. *(Superseded — live intake is now the Azure Graph PUSH-subscription
pipeline in section B; it is live in testing over the scoped test mailboxes, pending the production mailbox set.)*

### (historical) §2 Turn on the other two inboxes

Originally: **make.powerautomate.com → My flows → CS Intake (shared mailbox)**, copy/adjust per inbox,
interactively **sign in/authorise** each shared mailbox connection, point at the address and Save.
**Superseded** by the Exchange-RBAC grant for all three mailboxes + `GRAPH_INTAKE_MAILBOXES` (section B).

### (historical) §3 Provider auto-matching

Verified domains for **32 providers** (from `provider_email_audit_2026-06-22.csv`) were loaded into the
Dataverse `cr1bd_knownemaildomains` column, idempotent and ambiguity-guarded. The still-open residual
(DFD, Fairway, Regent, Castle, Stallion, Relay; NETWORK HD UK / YM Law → `gmail.com`) carries forward as
**D3** above, now against the Postgres provider domain field.

### (historical) §4 EVA submission

The EVA connection was built/deployed on Dataverse but switched off pending the EVA **test** Client
ID/Secret. The domain rule is unchanged and carries forward as **D1** (photo order: 2 previews first, then
all photos including those two; registration visible on the overview).

### (historical) §5 Box filing (Phase 7, ADR-0012)

The Box pivot was built offline + partly deployed on the old stack: the Dataverse schema-as-code (5 `BOX_*`
gates + 2 config vars + 3 `cr1bd_box*` columns + 3 audit actions) was **applied live in Dev with every
`BOX_*` gate `false`**; the **`box-webhook` Azure Function was deployed gated-off** (`cespkbox-fn-v76a47`,
FC1, Gate-C-verified: no-key→401, key+unsigned→400, facade gated-off→503; `BOX_API_ENABLED=false`,
`BOX_ALLOWED_ROOT_ID=392761581105`, KV `cespkboxkvv76a47` empty). The `cr1bd_box_rest` custom connector and
the Box flows were authored offline (`state=off`), **not imported/bound**. The **`box-webhook` Function
itself carries forward as a retained Python Function** (now activated via **D2**); the Dataverse env-var
gates / custom connector / Power Automate Box flows are decommissioned. Scope reminders that **still hold**:
start on **base Box Business** (Business Plus only for the optional metadata field); evidence is **linked,
not embedded** (no `frame-src` CSP edit); Box is a **one-way mirror, Postgres authoritative**. Full design
history: [plans/phase-7-box-integration/box-integration-activation.md](./plans/phase-7-box-integration/box-integration-activation.md).

### (historical) §6 Add extra reference info

Business reference lists (provider-code corrections, garage↔provider links, address lists) — carries
forward unchanged as **D4** (now loaded into Postgres).

### (historical) §7 Tidy-up items

- **Over-length provider codes:** 37 EVA-export names exceed the 8-char `principalcode` cap; these are
  **export name-artifacts, not real codes**, and the cap **stays 8** — see
  [over-length-principal-codes.md](./reference/over-length-principal-codes.md). Only the **5 active
  recurring businesses** need canonical short codes. *(Domain fact — still true.)*
- **`CS Case Resolve` duplicate-handling flow** — was intentionally off; Power-Automate-specific,
  decommissioned.
- **Shared readiness check inside the inbox flow** — Power-Automate refactor, decommissioned.
- **Rotate the parser function key** — carries forward as **D5** above (now rotate in Azure + update the
  orchestration's stored parser key).

### (historical) §8 SDLC-sweep features awaiting activation (2026-06-24)

These were built offline against Dataverse + Power Automate and switched OFF. Their **activation mechanics
are decommissioned**; the **design intent and any platform-agnostic residual carry forward**:

- **Chaser send (Phase 4b)** — draft-only chaser flow; "real send" was gated behind
  `cr1bd_CHASER_SEND_ENABLED`. *(Concept carries forward; Power-Automate flow decommissioned.)*
- **Location-assist (Phase 4a)** — Function + connector + gates + `location_assist_confirmed` audit;
  suggestions stay staff-picked, no auto-confirm (ADR-0013). *(Concept carries forward.)*
- **OCR for scanned PDFs (Phase 5a)** — now simply the retained **`ocr` Python Function**; the Dataverse
  connector/gate is decommissioned.
- **EVA-validation connector binding (Phase 3 / M2.B)** — now the retained **`evavalidation` Function**;
  the Dataverse connector-binding order is moot.
- **Inbox triage restructure (Phase 8)** — see the Phase-8 note above; concept carries forward into the
  Azure intake design.
- **Case disposition / retention (Phase 9, G1)** — retention-clock + scheduled disposition. **The hard
  pre-step survives as E1** (harden `cespkevidstdev01` first); the **policy decisions survive as E2**.
- **Staff roles assignment (Phase 9, G8)** — the 3-role least-privilege model. **Carries forward as C1**
  (now Entra app-role assignment on `cespk-api-dev`).
- **Evidence-store hardening (Phase 9, G6)** — **carries forward as E1**.
- **Org-level Dataverse auditing (Phase 9, G7)** — Dataverse-specific, decommissioned (Azure uses App
  Insights / Log Analytics + Postgres audit).
- **Policy/legal inputs (Phase 9, G1–G5)** — **carries forward unchanged as E2** (retention, lawful basis,
  legal-hold, ICO/DVLA terms, AI production sign-off).

> **(historical) G-code map:** G1 = retention period + the retention-clock/case-disposition build; G2 =
> legal-hold rule; G3 = ICO/DVLA registration + lawful basis + the DPIA; G4 = the DSAR cross-store runbook;
> G5 = AI-data-protection production sign-off (testing authorised now); G6 = store hardening incl.
> `cespkevidstdev01`; G7 = org-level audit enablement; G8 = the role assignment. Retained for cross-link
> resolution; the live equivalents are C1 / E1 / E2 above.
