# Roles & permissions

_Last updated **2026-06-24**. Two distinct concerns:_
_**(A)** the **operator platform-role gap analysis** for **`digital@collisionengineers.co.uk`** (the
Azure/Entra/Dataverse-admin roles needed to BUILD & ACTIVATE the spike), and_
_**(B)** the **in-app least-privilege role model** for STAFF WHO USE the intake app — the **3-role model**
(Phase 9, [ADR-0017 §G8](./adr/0017-data-retention-erasure-pii-lifecycle.md)), now **authored as
schema-as-code**. Companion to [docs/gated.md](./gated.md), [../DEPLOY-RUNBOOK.md](../DEPLOY-RUNBOOK.md),
[architecture/live-environment.md](./architecture/live-environment.md)._

> **Two role planes, do not conflate them.** (A) below is the **platform/operator** plane (Azure RBAC,
> Entra, Dataverse env admin) — a **gap list** of what `digital@` still needs. (B) further down is the
> **application** plane — the Dataverse **security roles** that scope what intake STAFF can do, built now
> offline and **gated-OFF**. "Admin" in plane (B) is the in-app settings/audit role, **not** Dataverse
> System Administrator or Power Platform Administrator from plane (A).

---

## Part A — operator platform-role gap analysis

> **What this part is.** Not a catalogue of every role — a **gap list**. It starts from what `digital@`
> *already holds* (verified live below), then lists only the **missing** roles, what each unblocks, and
> how to get it. It also calls out roles you might *expect* to need but don't.

## What you already have (verified live 2026-06-22)

A check of `digital@collisionengineers.co.uk` shows:

| Plane | What you hold | What it already covers |
|---|---|---|
| **Azure RBAC** | **Owner** on the subscription (`e6076573-…`) | All Azure deploy/manage: the Functions (parser, enrichment, EVA, evavalidation, address-match, OCR ACA, and the now-deployed Box webhook), Storage, Container Apps, Document Intelligence, App Insights — **and** assigning Azure RBAC to managed identities. Owner ⊇ Contributor + User Access Administrator. |
| **Dataverse (Dev env)** | **System Administrator** | The whole Power Platform *environment* build: the `CollisionSpike` tables/columns, the 10 cloud flows, the Code App (`pac code push`), env-var feature gates, and connections within the environment. This is a Dataverse **security role**, not an Entra directory role. |
| **Entra directory roles** | **None** (0 active, 0 PIM-eligible) | — nothing at the tenant directory level. |
| **Box** | A **free** account | Raw REST with a dev token only — no CCG, webhooks, File Requests, or metadata. |

**Takeaway:** Owner + Dataverse System Administrator are why everything built so far worked **without** any
Entra admin role. The gaps below are the things those two *don't* reach.

---

## Roles you NEED but don't have

### 🔴 Hard blockers for the remaining activation

| # | Role you're missing | Plane | What it unblocks · why your current roles don't cover it | How to get it |
|---|---|---|---|---|
| 1 | **Box Business plan + Box Admin / Co-Admin** | Box (vendor) | The **entire always-on Box layer**: folder-at-intake, the image-chaser **File Request**, and the **FILE.UPLOADED webhook → Evidence** pipeline. Your **free** Box account returns `unauthorized_client` for CCG and has no webhooks/File-Requests/metadata, so this is the long pole — the `SBL26001` demo had to do it all manually with a dev token. **Base Box Business is the floor** (folders + File Requests + webhooks + CCG); **Business Plus** only if you later want the metadata-capture field. | Purchase Box **Business**; make your Box user an **Admin/Co-Admin** in the Box Admin Console. |
| 2 | **Exchange Administrator** | Entra | Binding the **shared-mailbox intake** for the three Outlook inboxes — create/confirm the shared mailboxes and grant **Full Access / Send-As** to the identity the Office 365 Outlook connection runs as. Your Dataverse System Admin role can build the flow, but it **cannot grant mailbox permissions**. (Single-inbox intake on `digital@` works because you own that mailbox; scaling to the shared inboxes needs this.) | A Global Admin assigns you **Exchange Administrator** in the M365 admin center. |
| 3 | **Key Vault Secrets Officer** (data plane) | Azure | **Injecting secrets** the Functions read as Key Vault references — the **EVA test creds** (B5) and the **Box** `client_secret` + webhook signature keys (the now-deployed `box-webhook` Function already references these in `cespkboxkvv76a47`, which is empty until you inject them). Nuance: subscription **Owner is management-plane only** — on an RBAC-mode vault it does **not** grant data-plane secret read/write (this is exactly why a Box-secret KV write was blocked before). | **Self-assign** — you're Owner, so grant *yourself* **Key Vault Secrets Officer** on the vault(s). No one else needed. KV secret names are **hyphenated** (`eva-client-secret`, `box-client-secret`, `box-webhook-primary-key`…) and resolve into UPPER_SNAKE app settings. |

### 🟠 Needed for tenant governance + the test→prod rollout (not single-env blockers)

| # | Role you're missing | Plane | What it unblocks · why your current roles don't cover it | How to get it |
|---|---|---|---|---|
| 4 | **Power Platform Administrator** | Entra | **Tenant-level** Power Platform admin that the environment System Administrator role can't reach: managing the **Code Apps tenant setting**, **DLP policies**, **environment lifecycle/capacity** (e.g. standing up a TEST or PROD environment), and tenant-wide connector governance. Your Dev *build* is covered by System Administrator; this is the *admin-centre* gap. (B4 Code Apps enablement was presumably done by whoever holds Global Admin today — you'll need this to own it going forward.) | A Global Admin assigns **Power Platform Administrator**. |
| 5 | **License Administrator** (+ Billing Admin to purchase) | Entra | Assigning **Power Apps Premium / Power Automate premium** licenses to a dedicated **service account** (so connections aren't tied to a person) and to any additional makers. | A Global Admin assigns **License Administrator**; Billing Admin (or GA) buys the licenses. |

---

## Roles you might expect to need — but DON'T

- **Application Administrator / Global Administrator for "admin consent"** — **not needed here.** The
  external APIs (DVSA, DVLA, EVA, Box) issue their **own** credentials via their vendor portals / the Box
  Admin Console / Key Vault, and the custom connectors authenticate with an **api_key (Function host
  key)** — there are **no our-tenant Entra app registrations requiring tenant admin consent** in this
  build. (This is why enrichment went live without you holding any consent role.) Only a *future* Microsoft
  Graph **application** permission would require Global Admin / Privileged Role Administrator.
- **Azure Contributor / User Access Administrator** — **already covered** by your subscription **Owner**.
- **Dataverse System Administrator** — you **already have it** in Dev; no Entra role substitutes for it.

---

## Future phases — AI & automation (additional roles/blockers)

The AI/automation lanes on the roadmap (Copilot Studio, Foundry/OpenAI vision, Maps, WhatsApp,
valuation) mostly **reuse the gaps above** — none introduces a brand-new "must-have" Entra role beyond
**Power Platform Administrator** + **License/Billing Administrator**, *except* the one Graph-consent
scenario noted at the end. Details, so there are no surprises when these phases start:

### Copilot Studio (Phase 5c · M3 · gated `COPILOT_ENABLED`) — staff assistant over Dataverse
- **Power Platform Administrator** (already a gap) — enable **"Publish copilots with AI features"** + the
  generative-AI tenant settings in the Power Platform admin centre, and assign the **Copilot Studio
  authors** security group. **UK-specific:** generative answers/Bing grounding run in the US, so a
  Global/Power Platform admin must **turn on cross-geo data movement** for the environment — only those
  two roles can.
- **Billing Administrator** — buy the tenant **Copilot Studio** licence (prepaid credit pack, 25,000
  messages/mo; a *generative* answer costs **2 messages** — capacity-plan for it).
- **License Administrator** (already a gap) — assign the per-user **Copilot Studio User License**.
- Dataverse grounding (the agent's app user/security role) is covered by your **env System Admin**; DLP
  must allow the connectors the agent uses → Power Platform Admin.

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
1. **Microsoft Graph application-permission consent → Global Administrator / Privileged Role Administrator.**
   **None needed today** (the external APIs self-issue creds; connectors use api_key). This is the *only*
   thing that would force a GA/PRA-level grant — triggered if a Copilot agent / Dataverse-MCP, a
   **Graph-based** email intake (instead of the Outlook connector), or a SharePoint/Teams integration ever
   needs Graph **application** permissions.
2. **Capacity & licensing ceilings** — Power Apps/Automate premium, Copilot Studio messages, **Dataverse
   storage** (DB/file/log), Azure OpenAI TPM. Billing + License Admin + purchases/quota.
3. **Managed Environments + the test→prod path** — the EVA **production cutover** needs a TEST and a PROD
   environment (creating/managing them is a **Power Platform Administrator** action — the "Production/Trial
   environment assignments" tenant setting; Managed Environments may add licensing).
4. **DLP policy** — every new premium connector (OpenAI, Maps, ACS, Copilot, Box REST) must be
   classified/allowed → Power Platform Admin.
5. **Azure quota** — OpenAI TPM, ACA cores, Functions concurrency — support/quota requests.
6. **Data residency / compliance** — UK residency (Box **Zones** = Business Plus/Enterprise; Azure region
   pinning; Copilot cross-geo); M365-level DLP/retention would add **Compliance Administrator / Purview**.
7. **Conditional Access on a service account** — a non-interactive intake identity can be blocked by
   CA/MFA policy; needs a CA exception or a managed identity → Security / Conditional Access Administrator.

---

---

## Part B — the in-app least-privilege role model (3-role model, ADR-0017 §G8)

The roles in Part A are **platform/operator** roles that `digital@` needs to **build and activate** the
spike. Part B is the **application** plane: the Dataverse **security roles** that scope what intake
**staff** can do inside the Code App + tables. Today everything runs as **System Administrator** (no
least-privilege); this model closes that gap as part of the Phase-9 governance posture.

These roles are **authored now as schema-as-code, offline, and gated-OFF.** The build **creates** the
roles but **never assigns** them — assignment is the operator's activation step.

### Schema-as-code artefacts

| Artefact | What it is |
|---|---|
| [`dataverse/roles/_role.schema.json`](../dataverse/roles/_role.schema.json) | The authoring shape: a privilege matrix per table (the 8 axes × named access levels), plus `miscPrivileges` for non-`cr1bd_` privileges. |
| [`dataverse/roles/user-role.json`](../dataverse/roles/user-role.json) | **CollisionSpike User** — the full privilege matrix. |
| [`dataverse/roles/admin-role.json`](../dataverse/roles/admin-role.json) | **CollisionSpike Admin** — User + corpus write + settings + audit-log management (self-contained, restates User). |
| [`dataverse/.build/28-roles.ps1`](../dataverse/.build/28-roles.ps1) | The apply twin: creates the two roles + grants privileges via the Web API. **DRY-RUN by default** (no `-Apply` ⇒ zero tenant contact); **creates-not-assigns**. |

### The three roles

| App role | Scope | Status |
|---|---|---|
| **User** | All **case-intake** actions — review cases, complete the 12 fields, drive readiness, pick/edit the inspection address, export to EVA, draft chasers. CRUD on the work tables; **read-only** on the governed corpus; **create+read (never delete)** on the audit trail. | **Built now** (offline, gated-OFF; operator assigns at activation). |
| **Admin** | **User + settings + audit-log management** — **write** the provider/inspection-address corpus, triage ImprovementSignals, CRUD the env-var feature gates (definitions + values), and **delete** (cascade) audit rows. Superset of User. | **Built now** (offline, gated-OFF; operator assigns at activation). |
| **Engineer** | Future **assessment functionality** (the engineer who performs the inspection/assessment). | **DEFERRED — out of scope.** No JSON, not built by `28-roles.ps1`. |

> "Admin" here is the in-app **settings/audit** role, **not** Dataverse System Administrator or Power
> Platform Administrator (those are Part-A platform roles).

### The format (and why)

Each role JSON declares, **per table**, the eight Dataverse table-privilege axes
(**Create / Read / Write / Delete / Append / AppendTo / Assign / Share**), each set to a **named access
level** — `None` · `User` · `BusinessUnit` · `ParentChild` · `Organization`. This mirrors the repo's
existing JSON-schema-as-code style (`schema/_table.schema.json`, `choicesets/`): a reviewable, diffable,
**offline** authoring shape that the `.build/` apply script translates into live metadata.

- **`None` = omit the privilege entirely** (least-privilege default-deny). Any table NOT listed grants
  **nothing**.
- Named levels map to the **Web API `PrivilegeDepth`** the apply script sends:
  `User`=Basic(0) · `BusinessUnit`=Local(1) · `ParentChild`=Deep(2) · `Organization`=Global(3).
  (NB: this is the **Web API** enum, not the C# SDK enum, which numbers them differently.)
- This is a **single-business-unit** environment, so `Organization` depth means *"every row"* — which is
  exactly the **shared-queue** intent (intake is collaborative, not per-owner). A future multi-team split
  would downgrade the work tables to `ParentChild`/`BusinessUnit` and re-verify.

### Privilege matrix — CollisionSpike User

Legend: **C**reate · **R**ead · **W**rite · **D**elete · **A**ppend · **AT** AppendTo · (Assign/Share are
`None` everywhere — no per-record sharing model in a single-BU shared queue). `O` = Organization, `—` =
None.

| Table | C | R | W | D | A | AT | Why |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `cr1bd_case` | O | O | O | — | O | O | Core work item; shared-queue CRUD. **No delete** (disposition/junk-cleanup runs as flow/operator, not staff). |
| `cr1bd_evidence` | O | O | O | O | O | O | Per-case attachments; delete a mis-attached file is routine (child of Case). |
| `cr1bd_inboundemail` | O | O | O | — | O | O | Phase-8 triage; **no delete** (dedup anchor / "we saw this" row). |
| `cr1bd_chaser` | O | O | O | O | O | O | Draft chasers (disposable). |
| `cr1bd_note` | O | O | O | O | O | O | Collaborative case notes. |
| `cr1bd_improvementsignal` | O | O | — | — | O | O | Staff **raise** signals; triage/resolve is Admin (governance: feeds a Management queue). |
| `cr1bd_workprovider` | — | O | — | — | — | O | Governed corpus → **read-only**; AppendTo so a Case can reference it. |
| `cr1bd_repairer` | — | O | — | — | — | O | Governed corpus → **read-only**. |
| `cr1bd_inspectionaddress` | — | O | — | — | — | O | Suggestions corpus staff **pick** from → read + AppendTo only. |
| `cr1bd_imagesource` | — | O | — | — | — | O | Corpus-adjacent → read-only. |
| `cr1bd_fieldlevelprovenance` | O | O | O | — | O | O | Stamp/clear reviewState during review; no delete (review audit). |
| `cr1bd_auditevent` | O | O | — | — | O | O | **Append-only**: create + read, **never write/delete** (tamper-evidence). |

No platform/maker privileges: a User can run the app and do intake, but cannot configure the system, edit
schema, or touch env-vars.

### Privilege matrix — CollisionSpike Admin (= User + the additions below)

The Admin JSON is **self-contained** (it restates every User privilege; the apply script never merges).
Differences vs User:

| Table / privilege | Admin change | Why |
|---|---|---|
| `cr1bd_improvementsignal` | **+ Write, + Delete** | Management **triages/resolves** the signal queue. |
| `cr1bd_workprovider` | **+ Create, + Write** (still **no Delete**) | Management **edits** the provider corpus; referenced providers are **archived/merged, never hard-deleted** (Case/PO history depends on old codes). |
| `cr1bd_repairer` | **+ Create, + Write** (no Delete) | Edit repairer corpus; archive-not-delete. |
| `cr1bd_inspectionaddress` | **+ Create, + Write** (no Delete) | Curate the inspection-address suggestions corpus; archive-not-delete. |
| `cr1bd_imagesource` | **+ Create, + Write** (no Delete) | Edit image-source corpus; archive-not-delete. |
| `cr1bd_auditevent` | **+ Delete** (still **no Write**) | Audit-log **management** — the ADR-0017 cascade/retention authority. Delete only (governed cascade); **never** in-place edit (rows stay append-only/tamper-evident). |
| `environmentvariabledefinition` | **Create / Read / Write** | Manage the feature-gate **definitions** (name/type/default). |
| `environmentvariablevalue` | **Create / Read / Write / Delete** | Set/toggle/clear the per-environment **gate values** — the activation lever (`BOX_API_ENABLED` etc.). Deleting a value reverts the gate to its solution default. |

The two `environmentvariable*` tables are **built-in Dataverse tables** (not `cr1bd_`), so the Admin JSON
expresses them under `miscPrivileges` by **stable privilege name** (`prvReadEnvironmentVariableValue`, …),
resolved to GUIDs at apply time — same mechanism as the `cr1bd_` table privileges.

### How "gated-off" is enforced — create-not-assign

`28-roles.ps1` **creates** the roles and **grants their privileges**, but contains **no role-assignment
call whatsoever** (no `systemuserroles_association` / `teamroles_association`). An **unassigned role
grants no one anything**, so creating it live is inert — everything keeps running as System Administrator
until the operator assigns the roles in the Power Platform admin centre. That is the activation step, and
it is **`[RESERVED-FOR-USER]`**.

The script is also **DRY-RUN by default**: with no `-Apply` flag it reads + validates the role JSON and
**prints the plan** (every role and its resolved privilege grants) with **zero tenant contact and no
login**. `-Apply` is required to touch the environment.

### Environment-resolved GUIDs (not fabricated)

A Dataverse security role cannot be fully expressed as standalone code — two GUID classes are
**per-environment** and are looked up live at `-Apply` time (mirroring how `optionset-ids.json` records
choiceset GUIDs):

1. **Root business-unit GUID** — a role must bind to a BU; the script queries the BU where
   `parentbusinessunitid eq null`. Stored nowhere in the JSON.
2. **Privilege GUIDs** — the role JSON declares stable privilege **names**
   (`prvReadCr1bd_case`, derived as `prv<Axis><PascalEntity>`; `prvReadEnvironmentVariableValue` for misc);
   the script queries the `privilege` table by name to resolve each GUID. An unresolved name is a **hard
   error** (never a fabricated or silently-skipped GUID).

The **depth integer** *is* expressible and is fixed (the Web API `PrivilegeDepth` enum above), so it lives
in the matrix as a named access level.

---

## Who grants what (Part A platform roles)

- **You self-grant** (you're subscription Owner): **Key Vault Secrets Officer** on the vault(s).
- **You purchase + self-administer** (Box vendor): **Box Business** plan + **Box Admin/Co-Admin**.
- **A Global Administrator must assign** (Entra/M365 admin centre): **Exchange Administrator**, **Power
  Platform Administrator**, **License Administrator**. If you don't know who holds Global Admin, the
  account that first signed up for the tenant is a Global Admin by default; keep GA to a break-glass
  account with MFA and assign yourself these least-privilege roles instead of standing GA.

---

## What stays the operator's regardless of roles

Even with every role above, these remain human/operator actions (per the live-services boundary):
**live email sends** + the "did the inbox fire" confirmation, the **Box Admin Console** authorization
(CCG / File Request template / webhook), injecting **production** secrets, and the **final live-confirm**
of any outward-facing change. See [docs/gated.md](./gated.md) for the per-item blocker registry.
