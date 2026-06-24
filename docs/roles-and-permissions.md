# Roles & permissions — the gaps you still need

_Last updated **2026-06-22**. A **gap analysis** for the operator account
**`digital@collisionengineers.co.uk`** — the roles you do **NOT** currently have that you **NEED** to
finish activation. Companion to [docs/gated.md](./gated.md), [../DEPLOY-RUNBOOK.md](../DEPLOY-RUNBOOK.md),
[architecture/live-environment.md](./architecture/live-environment.md)._

> **What this doc is.** Not a catalogue of every role — a **gap list**. It starts from what `digital@`
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

## Application roles (the in-app role model — distinct from the platform roles above)

The roles above are **platform/operator** roles (Azure RBAC, Dataverse env admin, Entra) that
`digital@` needs to **build and activate** the spike. Separately, the **application** defines its own
**three-role model** for staff who *use* the intake app (G8). These are **authored now, offline, and
gated OFF** (no live security-role assignment yet); the operator assigns them at activation.

| App role | Scope | Status |
|---|---|---|
| **User** | All **case-intake** actions — the day-to-day workflow (review cases, complete the 12 fields, drive readiness, pick/edit the inspection address, export to EVA / draft chasers). | **Built now** (offline, gated OFF; operator assigns at activation). |
| **Admin** | **Settings + audit logs** — the configuration surface (env-var gates, provider/corpus settings) and visibility of the `cr1bd_auditevent` action log. Superset of User. | **Built now** (offline, gated OFF; operator assigns at activation). |
| **Engineer** | Future **assessment functionality** (the engineer who performs the inspection/assessment). | **DEFERRED — out of scope** for the current build. |

> These are app-level roles, not the platform roles in the gap analysis above. "Admin" here is the
> in-app settings/audit role, **not** Dataverse System Administrator or Power Platform Administrator.

## Who grants what

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
