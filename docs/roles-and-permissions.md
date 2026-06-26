# Roles & permissions

_Last updated **2026-06-26** — reframed to the **live Azure PaaS stack** (the Power Platform
implementation is **decommissioned**). Two distinct concerns:_
_**(A)** the **operator platform-role gap analysis** for **`digital@collisionengineers.co.uk`** (the
Azure/Entra roles needed to BUILD, ACTIVATE & RUN the spike), and_
_**(B)** the **in-app least-privilege role model** for STAFF WHO USE the intake app — now the **two Entra
app roles** `CollisionSpike.User` / `CollisionSpike.Admin` enforced by the **Data API** (and, since
2026-06-26, also **Postgres RLS**), carrying the privilege intent of the prior Dataverse roles (Phase 9,
[ADR-0017 §G8](./adr/0017-data-retention-erasure-pii-lifecycle.md); migration spec
[`migration/31-auth-migration.md`](../migration/31-auth-migration.md)). Companion to
[docs/gated.md](./gated.md), [../DEPLOY-RUNBOOK.md](../DEPLOY-RUNBOOK.md),
[architecture/live-environment.md](./architecture/live-environment.md)._

> **LIVE-STACK NOTE (2026-06-26).** The running system is the **Azure PaaS stack** (SPA on Static Web App
> `cespk-spa-dev` with **MSAL/Entra** sign-in → Data API `cespk-api-dev` → Postgres `cespk-pg-dev`; the
> Python parser/enrichment/EVA/box Functions retained). The **Power Platform** build (Code App, Dataverse,
> ~16 Power Automate flows, custom connectors) is **decommissioned** — where this doc still describes it
> (Dataverse security roles, the Code App, DLP, Power-Platform-admin gaps), that content is **HISTORICAL**
> and banded as such; the **business domain and privilege intent are unchanged**.

> **Two role planes, do not conflate them.** (A) below is the **platform/operator** plane (Azure RBAC,
> Entra directory roles, vendor onboarding) — a **gap list** of what `digital@` still needs to build/run
> the Azure stack. (B) further down is the **application** plane — the **Entra app roles** that scope what
> intake STAFF can do inside the SPA + API. "Admin" in plane (B) is the in-app settings/audit role
> (`CollisionSpike.Admin`), **not** an Azure subscription Owner or any Entra **directory** admin role from
> plane (A).

---

## Part A — operator platform-role gap analysis

> **What this part is.** Not a catalogue of every role — a **gap list**. It starts from what `digital@`
> *already holds* (verified live below), then lists only the **missing** roles, what each unblocks, and
> how to get it. It also calls out roles you might *expect* to need but don't.

> **LIVE-STACK RE-FRAME (2026-06-26).** This gap analysis was written for the Power-Platform build/activate
> era. On the **live Azure stack** the **subscription Owner** row is the load-bearing one (it covers the
> SPA, Data API, orchestration, Postgres, and all retained Functions); the **Dataverse System
> Administrator** row is **HISTORICAL** (Dataverse is decommissioned — see banding below). The biggest
> auth-model change: **intake mailbox access is now [Exchange RBAC for Applications]**, not the Office 365
> Outlook connector and **not** a Graph `Mail.Read` admin consent — corrected throughout below. New live
> blocker not in the original list: the whole stack is on an **Azure Free Trial** (disabled at ~30 days
> unless upgraded to **Pay-As-You-Go**).
>
> [Exchange RBAC for Applications]: https://learn.microsoft.com/exchange/permissions-exo/application-rbac

## What you already have (verified live 2026-06-22, re-confirmed 2026-06-26)

A check of `digital@collisionengineers.co.uk` shows:

| Plane | What you hold | What it already covers |
|---|---|---|
| **Azure RBAC** | **Owner** on the subscription (`e6076573-…`, **Free Trial**) | All Azure deploy/manage for the **live stack**: the **Data API** (`cespk-api-dev`), the **orchestration** app (`cespk-orch-dev`), **Postgres** (`cespk-pg-dev`), the **SPA** Static Web App (`cespk-spa-dev`), and the retained Functions (parser, enrichment, EVA, evavalidation, OCR, Box webhook), Storage, Document Intelligence, App Insights — **and** assigning Azure RBAC to managed identities. Owner ⊇ Contributor + User Access Administrator. **Management-plane only** — see the Key Vault data-plane gap below. |
| **Entra app registrations** | **SPA / Data API / Graph-intake** regs created (single-tenant) | The **app-role** plane (`CollisionSpike.User` / `CollisionSpike.Admin`) and MSAL sign-in (Part B). Created without any Entra **directory** admin role (single-tenant app regs need none). |
| **Entra directory roles** | **None** (0 active, 0 PIM-eligible) | — nothing at the tenant directory level. |
| **Box** | A **free** account | Raw REST with a dev token only — no CCG, webhooks, File Requests, or metadata. |
| **[HISTORICAL] Dataverse (Dev env)** | **System Administrator** | *Decommissioned.* Covered the whole Power Platform *environment* build: the `CollisionSpike` tables/columns, the ~16 cloud flows, the Code App (`pac code push`), env-var feature gates, connections. A Dataverse **security role**, not an Entra directory role. No Azure-stack equivalent is needed — the analogous control is now **Azure RBAC** on the resources (Owner, above). |

**Takeaway:** subscription **Owner** is why the Azure stack builds and runs **without** any Entra
directory admin role. (Historically, Dataverse System Administrator played that part for the Power
Platform build.) The gaps below are the things Owner *doesn't* reach.

---

## Roles you NEED but don't have

### 🔴 Hard blockers for the remaining activation

| # | Role you're missing | Plane | What it unblocks · why your current roles don't cover it | How to get it |
|---|---|---|---|---|
| 1 | **Box Business plan + Box Admin / Co-Admin** | Box (vendor) | The **entire always-on Box layer**: folder-at-intake, the image-chaser **File Request**, and the **FILE.UPLOADED webhook → Evidence** pipeline. Your **free** Box account returns `unauthorized_client` for CCG and has no webhooks/File-Requests/metadata, so this is the long pole — the `SBL26001` demo had to do it all manually with a dev token. **Base Box Business is the floor** (folders + File Requests + webhooks + CCG); **Business Plus** only if you later want the metadata-capture field. | Purchase Box **Business**; make your Box user an **Admin/Co-Admin** in the Box Admin Console. |
| 2 | **Exchange Administrator** | Entra | **Authorising the intake app's mailbox access** via **Exchange RBAC for Applications** — an Exchange Admin runs `New-ServicePrincipal` + `New-ManagementScope` + `New-ManagementRoleAssignment` to grant the `cespk-graph-intake` app **resource-scoped** Graph mailbox roles over the three intake mailboxes, so the orchestration tier can **delta-poll** them. **This SUPERSEDES the old model** (shared-mailbox Full Access/Send-As for the Office 365 Outlook connector, and the Graph `Mail.Read` admin-consent path) — it needs **NO Global Admin** and **no Entra consent**. **Verified live on `digital@` 2026-06-26** (`Test-ServicePrincipalAuthorization` → `InScope: True`); the 3 real mailboxes are **not yet scoped**, and the orchestration app is **built but undeployed** (no live intake yet). | A **Global Admin** assigns you (or another admin) **Exchange Administrator** in the M365 admin center; the Exchange Admin then runs the RBAC grant. |
| 3 | **Key Vault Secrets Officer** (data plane) | Azure | **Injecting secrets** read as Key Vault references — the **EVA test creds**, the **Box** `client_secret` + webhook signature keys (the `box-webhook` Function references these in `cespkboxkvv76a47`, empty until injected), the **Graph-intake** client secret/cert. _(The **live P0** here is now **closed (2026-06-26)** — the **Data API's Postgres credential** moved off server-admin `csadmin` to the **non-owner login `cespk_app`** with its password a **Key Vault reference**, RLS now enforced, no cleartext.)_ Nuance: subscription **Owner is management-plane only** — on an RBAC-mode vault it does **not** grant data-plane secret read/write. | **Self-assign** — you're Owner, so grant *yourself* **Key Vault Secrets Officer** on the vault(s). KV secret names are **hyphenated** and resolve into UPPER_SNAKE app settings. |

### 🟠 Needed for governance + the test→prod rollout (not single-env blockers)

**LIVE-STACK (Azure):** the **dominant** governance blocker is now **billing**, not a Power-Platform admin
role — the subscription is an **Azure Free Trial** that **disables the whole stack at ~30 days** unless
upgraded to **Pay-As-You-Go** (the 12-month free Postgres allowance survives the upgrade). The **test→prod
rollout** is an Azure action your subscription **Owner** already covers (stand up a prod resource group /
Static Web App + Function Apps + Postgres; promote Entra app regs). There is **no DLP / connector
governance / environment-lifecycle** surface to manage — those were Power-Platform concepts.

| # | Role / action you're missing | Plane | What it unblocks | How to get it |
|---|---|---|---|---|
| 4 | **Billing Administrator** (or Account Admin) | Azure | **Upgrading the Free Trial subscription to Pay-As-You-Go** before the ~30-day cutoff, and standing up a prod subscription/RG. The hard deadline for the live stack. | The account/billing owner upgrades in the Azure portal (Subscriptions → *Upgrade*). |
| 5 | **[HISTORICAL] Power Platform Administrator** | Entra | *Moot — decommissioned.* Was the tenant-level Power-Platform admin (Code Apps tenant setting, DLP policies, environment lifecycle/capacity, connector governance). No Azure-stack equivalent. | — |
| 6 | **[HISTORICAL] License Administrator** (Power Apps/Automate premium) | Entra | *Moot — decommissioned.* Was for assigning **Power Apps Premium / Power Automate premium** licenses to a service account. The Azure stack has **no per-user premium licensing** — it bills on Azure consumption (row 4). | — |

---

## Roles you might expect to need — but DON'T

- **Global Administrator for Graph `Mail.Read` admin consent** — **NOT needed, and NOT how intake works.**
  The intake app holds **no Entra Graph permission**; mailbox access is granted out-of-band by an
  **Exchange Administrator** via **Exchange RBAC for Applications** (resource-scoped mailbox roles), which
  needs **no Global Admin and no tenant consent** (verified live 2026-06-26). This **corrects** the older
  "a future Graph application permission would require Global Admin / Privileged Role Administrator" line —
  the Graph-intake path is designed precisely to avoid that.
- **Application Administrator / Global Administrator for SPA→API consent** — **not needed.** The three Entra
  app regs (SPA, Data API, Graph-intake) are **single-tenant** and owned by the operator, who **self-consents**
  to the SPA's delegated `access_as_user` scope; the external APIs (DVSA, DVLA, EVA, Box) still issue their
  **own** vendor credentials into Key Vault. No tenant-admin consent role is required.
- **Azure Contributor / User Access Administrator** — **already covered** by your subscription **Owner**.
- **[HISTORICAL] Dataverse System Administrator** — *decommissioned.* It was the build role for the Power
  Platform environment; the live-stack analogue is **Azure RBAC** (Owner) on the resources.

---

## Future phases — AI & automation (additional roles/blockers)

The AI/automation lanes on the roadmap (Foundry/OpenAI vision, Maps, WhatsApp, valuation) mostly **reuse
the Azure gaps above** (subscription **Owner** + data-plane RBAC + **Billing** + vendor onboarding).
Details, so there are no surprises when these phases start:

> **BANDING (2026-06-26).** On the live Azure stack the **Azure** lanes below (Foundry/OpenAI, Maps, ACS,
> valuation) stand. The **Copilot Studio** lane is **Dataverse-anchored** and was scoped against the
> **decommissioned** Power Platform — it is **HISTORICAL** as written; any future staff-assistant would be
> re-scoped against **Postgres + the Data API** (e.g. Azure AI Foundry agents), not Copilot Studio over
> Dataverse, so the Power-Platform-admin/License gaps it cites no longer apply.

### [HISTORICAL] Copilot Studio (was Phase 5c · M3 · gated `COPILOT_ENABLED`) — staff assistant over Dataverse
- **Power Platform Administrator** — *moot (decommissioned)*: was to enable **"Publish copilots with AI
  features"** + the generative-AI tenant settings and assign the **Copilot Studio authors** group.
  **UK-specific:** generative answers/Bing grounding run in the US → cross-geo data movement toggle.
- **Billing Administrator** — *was* to buy the tenant **Copilot Studio** licence (prepaid credit pack,
  25,000 messages/mo; a *generative* answer costs **2 messages**).
- **License Administrator** — *was* to assign the per-user **Copilot Studio User License**.
- Dataverse grounding + DLP — both Power-Platform constructs; **no live equivalent**.

### Azure AI Foundry / Azure OpenAI (Phase 5b image classification + reflection; valuation reasoning)
- **Provisioning is covered by your Azure Owner.** But inference is **data-plane RBAC** (same
  management-vs-data-plane split as Key Vault): self-assign **Cognitive Services OpenAI User** (Entra-auth
  inference calls), **Cognitive Services Contributor** (create/deploy models), and (subscription-level)
  **Cognitive Services Usages Reader** (view quota). You can grant all three to yourself as Owner.
- **Model quota (TPM)** is per region/model — you get a default on onboarding; more needs a **quota-increase
  request** ([aka.ms/oai/stuquotarequest](https://aka.ms/oai/stuquotarequest)). A request/approval blocker, not a role.
- **Region/model + data residency** — newer vision models may not be in **UK South**; deploying elsewhere
  is a UK data-residency decision.

### Other AI/automation
- **AI Builder** — deliberately **NOT used** (ADR-0009; AI Builder credits sunset 2026-11-01 → Foundry
  vision instead). If ever revisited: AI Builder credit capacity (Billing) + the tenant "AI Builder
  credits" setting (Power Platform Admin).
- **Azure Maps** (Phase 4a · M3 · `AZURE_MAPS_ENABLED`) — Azure, **Owner covers**; data-plane Azure Maps
  Data Reader self-assign or key. Optional — postcode.io is the M1 default.
- **Azure Communication Services / WhatsApp** (M3 · ADR-0007) — ACS is Azure (**Owner covers**), **but**
  WhatsApp Business via ACS Advanced Messaging needs **Meta / WhatsApp Business Account onboarding +
  number/sender verification** — a **vendor** onboarding blocker (like Box), plus a registered WABA.
- **Valuation (`valuationbot`, M3)** — a REST-wrapper Function (Owner covers) + the valuation provider's
  API credentials in Key Vault (vendor creds, like EVA/DVSA).

### Cross-cutting blockers to expect as you scale
1. **Graph mailbox access → Exchange Administrator (NOT Global Admin).** The live **Graph-delta-poll**
   email intake is authorised by **Exchange RBAC for Applications** (resource-scoped mailbox roles granted
   by an Exchange Admin) — it needs **no Graph application permission and no Global-Admin/PRA consent**.
   This **supersedes** the old "Graph-based email intake would need a GA/PRA application-permission grant"
   line. A GA/PRA-level Graph **application** consent would only return if some *future* integration
   (SharePoint/Teams, a Graph-wide app permission) needs it — intake itself does not.
2. **Billing / capacity ceilings (Azure)** — the **Free-Trial→PAYG** upgrade (row 4 above) is the first
   ceiling; then Azure OpenAI **TPM**, Postgres tier/storage, Functions/SWA consumption. Billing +
   quota/support requests. *(Historical: Power Apps/Automate premium, Copilot Studio messages, Dataverse
   storage — no longer apply.)*
3. **Test→prod path (Azure)** — the EVA **production cutover** needs a **prod resource group /
   subscription** (Static Web App + Function Apps + Postgres + Entra app regs), an Azure action your
   subscription **Owner** covers. *(Historical: the Power-Platform "Managed Environments / TEST+PROD
   environment" model and its Power-Platform-Administrator action are decommissioned.)*
4. **[HISTORICAL] DLP policy** — *moot.* Was: every new premium **connector** classified/allowed via Power
   Platform Admin. The Azure stack has **no connectors / no DLP surface**.
5. **Azure quota** — OpenAI TPM, Functions concurrency — support/quota requests.
6. **Data residency / compliance** — UK residency (Box **Zones** = Business Plus/Enterprise; Azure region
   pinning; Copilot cross-geo); M365-level DLP/retention would add **Compliance Administrator / Purview**.
7. **Conditional Access on a service account** — a non-interactive intake identity can be blocked by
   CA/MFA policy; needs a CA exception or a managed identity → Security / Conditional Access Administrator.

---

---

## Part B — the in-app least-privilege role model (two Entra app roles, ADR-0017 §G8)

The roles in Part A are **platform/operator** roles that `digital@` needs to **build, activate and run**
the spike. Part B is the **application** plane: the roles that scope what intake **staff** can do inside
the **SPA + Data API + Postgres**.

**LIVE-STACK MODEL (2026-06-26).** Two **Entra app roles** — **`CollisionSpike.User`** and
**`CollisionSpike.Admin`** — defined on the **Data API** app registration (`cespk-api`). The SPA acquires
an Entra token for the API audience; the API reads the **`roles`** claim on **every** request and enforces
User vs Admin per route; **Postgres Row-Level Security** (the DB app-role set **per connection** via the
libpq startup option `-c app.role`, default `staff`) is the belt-and-braces DB enforcement of the same
boundary — **live and enforced since 2026-06-26**, since the API connects as the non-owner login `cespk_app`.
The two app roles **carry the privilege intent of the
prior two Dataverse security roles** unchanged — only the enforcement mechanism moved. Spec:
[`migration/31-auth-migration.md`](../migration/31-auth-migration.md) (authz) +
[`migration/20-data-and-schema-migration.md` §2](../migration/20-data-and-schema-migration.md) (RLS).

> **Activation state.** App roles are assigned under **Enterprise Applications → `cespk-api` → Users and
> groups**. **Only one staff principal is app-role-assigned so far** — unassigned staff get a token with
> **no `roles` claim** → the API treats them as **no-access (default-deny)** and they 403 until assigned.
> Assigning the remaining staff is the operator's activation step (`[RESERVED-FOR-USER]`).
>
> **RLS now enforced (2026-06-26).** The Data API connects as the **non-owner** login **`cespk_app`**
> (`rolsuper=false`, `rolbypassrls=false`; password a **Key Vault reference**, no cleartext), so the authored
> `FORCE ROW LEVEL SECURITY` policies are **enforced** — the prior server-admin `csadmin` connection, as
> table owner, bypassed them. The DB app-role is set **per connection** via the libpq startup option
> `-c app.role=staff` (the `PGAPPROLE` app-setting; **not** a `SET LOCAL`-per-query call). The boundary is now
> enforced **both** in the API code **and** by RLS (belt-and-braces). A future admin-only destructive path
> (the ADR-0017 retention/erasure cascade — **not yet implemented**) must run on a **separate** pool opened
> with `-c app.role=admin`, gated on a verified `CollisionSpike.Admin` token — the staff pool's role is never
> widened.

> **[HISTORICAL] Prior authoring shape (decommissioned).** Before migration these were **Dataverse
> security roles** authored as schema-as-code under `dataverse/roles/` (`_role.schema.json`,
> `user-role.json`, `admin-role.json`) and applied by `dataverse/.build/28-roles.ps1` (a DRY-RUN-by-default,
> create-not-assign apply script over the Dataverse Web API, mapping the 8 table-privilege axes to
> `PrivilegeDepth`). Those JSON files remain the **machine-readable source of the privilege intent** (the
> migration carries them over as the API authz spec), but the **Dataverse apply mechanics** — business-unit
> binding, `prv<Axis><Entity>` privilege-GUID resolution, the Power-Platform-admin assignment step — **no
> longer apply** on the live stack.

### The two live roles (+ one deferred)

| App role | Scope | Status |
|---|---|---|
| **`CollisionSpike.User`** | All **case-intake** actions — review cases, complete the 12 fields, drive readiness, pick/edit the inspection address, export to EVA, draft chasers. CRUD on the work tables; **read-only** on the governed corpus; **create+read (never delete)** on the audit trail. | **Live** (one staff principal assigned; others 403 until assigned). |
| **`CollisionSpike.Admin`** | **User + settings + audit-log management** — **write** the provider/inspection-address corpus, triage improvement signals, manage the **feature-gate app-settings**, and **delete** (retention cascade) audit rows. Superset of User. | **Live** (assigned to the one current admin principal). |
| **Engineer** | Future **assessment functionality** (the engineer who performs the inspection/assessment). | **DEFERRED — out of scope.** Not defined as an app role. |

> "Admin" here is the in-app **settings/audit** role (`CollisionSpike.Admin`), **not** an Azure
> subscription **Owner** or any Entra **directory** admin role (those are Part-A platform roles).

### The format (privilege intent, per table)

The privilege intent is expressed **per table** as the CRUD-plus axes
(**Create / Read / Write / Delete / Append / AppendTo**) — the shape carried over from the prior
Dataverse role JSON. On the live stack each axis is **allowed or denied**, enforced by the **Data API**
per route (and, since 2026-06-26, also by **Postgres RLS** policies):

- **Default-deny.** A table/axis not granted grants **nothing**. There is **no schema / role-management /
  feature-flag surface** in the app for a User.
- The tables below use the **prior `cr1bd_*` names**; their **Postgres analogues** carry the identical
  intent: `cr1bd_case`→`case_`, `cr1bd_evidence`→`evidence`, `cr1bd_inboundemail`→`inbound_email`,
  `cr1bd_chaser`→`chaser`, `cr1bd_note`→`note`, `cr1bd_improvementsignal`→`improvement_signal`,
  `cr1bd_workprovider`→`work_provider`, `cr1bd_repairer`→`repairer`,
  `cr1bd_inspectionaddress`→`inspection_address`, `cr1bd_imagesource`→`image_source`,
  `cr1bd_fieldlevelprovenance`→`field_level_provenance`, `cr1bd_auditevent`→`audit_event`.
- This is a **single-tenant, staff-only, shared-queue** system — intake is collaborative (every staff
  member sees every row), so a granted axis means *"permitted on all rows"* (there is no per-owner /
  per-record sharing model). A future multi-team split would re-introduce row scoping and re-verify.

### Privilege matrix — `CollisionSpike.User`

Legend: **C**reate · **R**ead · **W**rite · **D**elete · **A**ppend · **AT** AppendTo. `✓` = permitted,
`—` = denied. (No per-record Assign/Share model in a single-tenant shared queue.)

| Table (Postgres) | C | R | W | D | A | AT | Why |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `case_` | ✓ | ✓ | ✓ | — | ✓ | ✓ | Core work item; shared-queue CRUD. **No delete** (disposition/junk-cleanup runs as the orchestration/operator, not staff). |
| `evidence` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Per-case attachments; delete a mis-attached file is routine (child of Case). |
| `inbound_email` | ✓ | ✓ | ✓ | — | ✓ | ✓ | Triage; **no delete** (dedup anchor / "we saw this" row). |
| `chaser` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Draft chasers (disposable). |
| `note` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Collaborative case notes. |
| `improvement_signal` | ✓ | ✓ | — | — | ✓ | ✓ | Staff **raise** signals; triage/resolve is Admin (governance: feeds a Management queue). |
| `work_provider` | — | ✓ | — | — | — | ✓ | Governed corpus → **read-only**; AppendTo so a Case can reference it. |
| `repairer` | — | ✓ | — | — | — | ✓ | Governed corpus → **read-only**. |
| `inspection_address` | — | ✓ | — | — | — | ✓ | Suggestions corpus staff **pick** from → read + AppendTo only. |
| `image_source` | — | ✓ | — | — | — | ✓ | Corpus-adjacent → read-only. |
| `field_level_provenance` | ✓ | ✓ | ✓ | — | ✓ | ✓ | Stamp/clear reviewState during review; no delete (review audit). |
| `audit_event` | ✓ | ✓ | — | — | ✓ | ✓ | **Append-only**: create + read, **never write/delete** (tamper-evidence). |

No platform/admin privileges: a User can run the app and do intake, but cannot manage the corpus, the
feature gates, or the audit trail.

### Privilege matrix — `CollisionSpike.Admin` (= User + the additions below)

Admin is a **superset** of User (the API checks for `CollisionSpike.Admin` on the privileged routes).
Differences vs User:

| Table / privilege | Admin change | Why |
|---|---|---|
| `improvement_signal` | **+ Write, + Delete** | Management **triages/resolves** the signal queue. |
| `work_provider` | **+ Create, + Write** (still **no Delete**) | Management **edits** the provider corpus; referenced providers are **archived/merged (`active=false`), never hard-deleted** (Case/PO history depends on old codes). |
| `repairer` | **+ Create, + Write** (no Delete) | Edit repairer corpus; archive-not-delete. |
| `inspection_address` | **+ Create, + Write** (no Delete) | Curate the inspection-address suggestions corpus; archive-not-delete. |
| `image_source` | **+ Create, + Write** (no Delete) | Edit image-source corpus; archive-not-delete. |
| `audit_event` | **+ Delete** (still **no Write**) | Audit-log **management** — the ADR-0017 cascade/retention authority. Delete only (governed cascade); **never** in-place edit (rows stay append-only/tamper-evident). |
| **Feature-gate settings** | **manage** | Set/toggle/clear the **feature gates** (`BOX_API_ENABLED`, `EVA_API_ENABLED`, …) — the activation levers. On the live stack these are **Function App / API app-settings** (the env-var gates carried over from Dataverse environment variables), managed by an Admin-only API route. |

### Invariants carried from the Dataverse roles (now enforced in the API + Postgres)

These three invariants are the heart of the model and are **unchanged** by the platform move
(`migration/31` "Invariants carried from Dataverse roles"):

1. **Audit append-only.** `audit_event` is **INSERT + SELECT for all roles, UPDATE for none, DELETE for
   Admin only** (retention cascade). Enforced in the API write path **and** (belt-and-braces) by withholding
   UPDATE/DELETE in the Postgres role unless Admin-RLS. **Never** in-place editable, even by Admin.
2. **Corpus archive-not-delete.** Providers / repairers / inspection-addresses / image-sources are
   retired with **`active=false`**, **never hard-deleted** (withheld even from Admin) — referenced
   principal codes must survive for **Case/PO history**.
3. **Default-deny.** Roles grant only what is listed; there is **no schema / role-management surface** in
   the app. The platform-admin plane (resource-group / Function / Key Vault / Postgres admin) is **Azure
   RBAC**, held separately from the two app roles (it was Dataverse System Administrator before).

### How default-deny is enforced — assign-to-grant

There is **no inert "create-not-assign" script** any more: the two app roles **exist** on the `cespk-api`
registration, but an **unassigned** staff account simply gets a token with **no `roles` claim** and is
treated as **no-access** by the API. Granting access = **assigning** the staff account to
`CollisionSpike.User` / `.Admin` under **Enterprise Applications → `cespk-api` → Users and groups** — the
operator activation step. (Historically the equivalent inertia was `28-roles.ps1` creating-but-not-assigning
Dataverse roles; the principle — *creating/defining a role grants no one anything until assigned* — is the
same.)

---

## Who grants what (Part A platform roles)

- **You self-grant** (you're subscription Owner): **Key Vault Secrets Officer** on the vault(s); the
  data-plane Azure RBAC (Cognitive Services / Maps) for the AI lanes.
- **You / the account owner do** (Azure billing): the **Free-Trial → Pay-As-You-Go** upgrade before the
  ~30-day cutoff, and standing up a prod RG/subscription.
- **You purchase + self-administer** (Box vendor): **Box Business** plan + **Box Admin/Co-Admin**.
- **An Exchange Administrator runs** (Exchange Online, **NOT Global Admin**): the **Exchange RBAC for
  Applications** grant for the intake app's mailbox roles (`New-ServicePrincipal` / `New-ManagementScope` /
  `New-ManagementRoleAssignment`). A Global Admin only needs to assign the *Exchange Administrator* role to
  whoever runs it.
- **You assign** (Entra, **Enterprise Applications → `cespk-api`**): staff accounts to
  `CollisionSpike.User` / `CollisionSpike.Admin` (the app-role activation step; one assigned so far).
- **[HISTORICAL]** the old GA-assigned **Power Platform Administrator** + **License Administrator** gaps are
  **decommissioned** — no longer required on the Azure stack.

---

## What stays the operator's regardless of roles

Even with every role above, these remain human/operator actions (per the live-services boundary):
**live email sends** + the "did the inbox fire" confirmation, the **Exchange RBAC grant** on the three real
intake mailboxes + **deploying the orchestration intake** (no automated intake is live yet), the **Box
Admin Console** authorization (CCG / File Request template / webhook), injecting **production** secrets
(EVA / Box / Graph-intake — the **Postgres credential** is already on the non-owner `cespk_app` login + Key
Vault reference), the **Free-Trial → PAYG** upgrade, the **staff app-role assignments**, and the **final
live-confirm** of any
outward-facing change. See [docs/gated.md](./gated.md) for the per-item blocker registry.
