# Roles & permissions — what the operator needs, and why

_Last updated **2026-06-22**. Companion to [docs/gated.md](./gated.md) (the operator-blocker
registry), [../DEPLOY-RUNBOOK.md](../DEPLOY-RUNBOOK.md), and
[architecture/live-environment.md](./architecture/live-environment.md) (the live ID registry)._

> **Why this doc exists.** `collisionspike` is not one product on one control plane — it spans
> **three** of them, and the roles you need are different in each. Most "I can't do X" moments on this
> build have been a missing role on one of these planes. This doc maps every role to *what it unlocks
> here* and *a real blocker we hit because it was missing*, so activation doesn't stall on a permission
> surprise.
>
> **The three planes:**
> 1. **Microsoft 365 / Microsoft Entra directory roles** — Power Platform, Exchange mailboxes, app
>    registrations, licensing. (Microsoft's
>    [admin-roles overview](https://learn.microsoft.com/en-us/microsoft-365/admin/add-users/about-admin-roles?view=o365-worldwide#administrator-roles-and-who-should-be-assigned).)
> 2. **Azure RBAC** — the Functions, Key Vault, Storage, Container Apps, Document Intelligence live in an
>    Azure *subscription* and are governed by Azure roles, **not** the directory roles above.
> 3. **Box Admin Console** — a separate vendor; Box has its own admin roles, outside Microsoft entirely.
>
> **Guiding principle (Microsoft's own):** assign the *least-permissive* role, keep Global Admins to a
> minimum (≤2, break-glass), and require MFA on every admin. Day-to-day this build needs **Power
> Platform Administrator + Exchange Administrator**; activation adds **Application Administrator +
> License Administrator** and the Azure/Box roles below — standing **Global Admin should not be
> required**.

---

## Plane A — Microsoft 365 / Microsoft Entra directory roles

| Role | What it unlocks for collisionspike | Real blocker it resolves |
|---|---|---|
| **Power Platform Administrator** | The primary role. Manages the `CollisionSpike` Dataverse solution + tables/columns + the env-var feature gates, the 10 Power Automate cloud flows, the custom connectors (CE Parser, DVSA-enrich, EVA Sentry, Box REST), DLP policies, the Code App's environment, and the **Code Apps tenant setting**. Also adds the Function managed identities as Dataverse **Application Users** (system-customizer/admin in the environment). | **B4 — Code Apps enablement.** `pac code push` failed until Code Apps was enabled on the environment and the maker was licensed. **Webhook intake never fired** (memory `flow-webhook-trigger-provisioning`): the Office 365 trigger had only been API-injected, so its webhook subscription was never registered — the fix (rebuild the V3 trigger in the maker designer) needs maker/Power Platform rights. **S10 — over-length principal codes** required widening `cr1bd_principalcode` (a Dataverse customization). |
| **Exchange Administrator** | The three Outlook **shared intake inboxes** — create them and grant **Full Access / Send-As** to the identity the Office 365 Outlook intake connection runs as. | **Email intake** is dead until the shared-mailbox connection is bound and the connection identity has Full Access to `digital@collisionengineers.co.uk`. Only `digital@` is the authorised test inbox today; scaling to the other two inboxes is the same Exchange grant repeated. |
| **Application Administrator** (or **Cloud Application Administrator**) | Register and configure the **Entra app registrations** in our tenant and **grant admin consent** for the external APIs (DVSA, DVLA, EVA, Box CCG). Per Microsoft's consent docs, these roles can consent to *any* API **except Microsoft Graph application permissions**. Our integrations are all **non-Graph**, so this role is sufficient for them. | **B1 / Phase 3a — enrichment.** DVSA/DVLA enrichment uses Entra `client_credentials`; it returned nothing until the app was registered/consented and creds were present. (Enrichment is now live — the only remaining blocker had been the `ENRICHMENT_ENABLED` gate, flipped 2026-06-20.) |
| **License Administrator** (+ **Billing Administrator** to purchase) | Assign **Power Apps Premium / per-app** and **Power Automate premium** licenses to makers and the intake service account — custom connectors + Code Apps are premium. Billing Admin buys the subscriptions. | Makers can't run/own premium-connector flows or push a Code App without a premium license; activation stalls at "no license" before any technical step. |
| **User Administrator** | Create/manage the **service account(s)** the intake connections sign in as, and the dev users; assign their licenses. | Needed to stand up a dedicated intake/service identity rather than binding connections to a person. |
| **Privileged Role Administrator** | The *only* directory role besides Global Admin that can grant admin consent for **Microsoft Graph application permissions**. | Held as a fallback: only needed if a future integration ever requests a Graph *application* permission (none today). Use instead of standing Global Admin for the consent step. |
| **Global Administrator** | Superset. Reserve for the few genuine one-time tenant operations (enabling preview/tenant features, Graph app-permission consent, initial role assignment). | Keep to a **break-glass** account with MFA; everything above is the least-privilege alternative for day-to-day. |

---

## Plane B — Azure RBAC (the cloud resources — *not* on the M365 admin page)

The parser/enrichment/EVA/OCR/box-webhook Functions, Key Vault, Storage, Container Apps and Document
Intelligence live under resource group **`rg-collisionspike-dev`**. These need **Azure** roles.

> **These are NOT current blockers.** The "Real blocker it resolves" column below means *the role you
> needed to deploy/operate the resource* — a **deploy-time requirement that is already met**. The
> **parser Function is live (Running) and is the primary extractor** (PyMuPDF → the 12-field EVA
> contract for text PDFs); **enrichment is live (gate ON)**; **Document Intelligence is online** as the
> managed OCR *fallback* for scanned PDFs (tesseract/fast-alpr on the OCR ACA host are primary). The only
> not-yet-wired piece is the OCR fallback path for scanned/image PDFs (connector wiring +
> `OCR_SCANNED_PDF_ENABLED`/`PLATE_OCR_ENABLED`); normal text-PDF extraction does not depend on it.

| Role (scope: `rg-collisionspike-dev`) | What it unlocks | Real blocker it resolves |
|---|---|---|
| **Contributor** | Deploy/manage the Function Apps, Storage, ACA, Document Intelligence, App Insights, and apply runtime hardening (e.g. `allowSharedKeyAccess=false`). | Deploy-time requirement (resolved) for every Azure deploy this build has done — all now **Running/online**: parser FC1, enrichment, EVA Sentry, evavalidation, the OCR ACA host, Document Intelligence. |
| **User Access Administrator** (or **Owner**) | Assign Azure RBAC to managed identities — e.g. **AcrPull** for the OCR container image, and the box-webhook Function's MI. | **OCR ACA deploy (PR #7)** failed 3× with "provision revision expired" — an **AcrPull RBAC-propagation race** (the role was created in the same deployment as the app). Fix: a **pre-granted user-assigned identity** for AcrPull via a separate ARM deploy — which requires the rights to assign that role. |
| **Key Vault Administrator** / **Key Vault Secrets Officer** | Inject the secrets the Functions read as Key Vault references: EVA `eva-client-id`/`eva-client-secret`, the DVSA/DVLA creds, and (later) Box `box-client-secret` + `box-webhook-primary-key` / `box-webhook-secondary-key`. | **B5 — EVA test creds + Box secrets.** `EVA_API_ENABLED` stays off and the box-webhook can't verify signatures until these KV secrets exist. **Note the naming:** KV secret names are **hyphenated**; the Function app settings are **UPPER_SNAKE** (`BOX_CLIENT_SECRET`, `BOX_WEBHOOK_PRIMARY_KEY`…) and resolve *from* the hyphenated secrets. |

> **Cross-plane gotcha:** a Function's **managed identity must also be a Dataverse Application User**
> with a security role before it can read Case / write Evidence + Audit. That grant lives on **Plane A**
> (Power Platform / Dataverse System Administrator), even though the identity itself is an Azure
> resource. The box-webhook receiver depends on this.

---

## Plane C — Box Admin Console (a separate vendor)

Box is **not** a Microsoft product; its admin roles live in the Box Admin Console.

| Box role | What it unlocks | Real blocker it resolves |
|---|---|---|
| **Box Admin / Co-Admin** | Register the **Box Platform app**, **Admin-authorize** the CCG (client-credentials grant) service identity, build the **template File Request** (with the `vehicle_registration` capture field), create the archive-root folder hierarchy, and manage the **FILE.UPLOADED webhook** subscription. | **The free Box account cannot do CCG** (memory `box-test-account`): `grant_type=client_credentials` returns `unauthorized_client`, there are no webhooks / File Requests / metadata, and `enterprise_id` is empty. This is why the always-on Box automation is **deferred to a business-account phase**; the free-account demo (case `SBL26001`) had to create the folder, upload the `.eml`/instructions, and mint shared links **manually** with a dev token. The **floor is base Box Business** (folders + File Requests + webhooks + CCG); **Business Plus** is needed **only** for the optional metadata feature. |

---

## Minimal activation role set (least privilege)

For an operator running the live activation end-to-end:

- **Microsoft 365 / Entra:** Power Platform Administrator · Exchange Administrator · Application
  Administrator · License Administrator. (Global Admin only as break-glass for one-time consent/tenant
  enablement.)
- **Azure (`rg-collisionspike-dev`):** Contributor + Key Vault Secrets Officer, with User Access
  Administrator (or Owner) for the one-time managed-identity role grants.
- **Box:** a Box Admin/Co-Admin seat (business account) — for the deferred always-on Box phase only.

---

## What Claude does vs what stays the operator's

Per the 2026-06-20 live-services boundary, Claude wires activations directly using the **directory/RBAC
access already granted to it** (live Dataverse schema/data, flow edits via the byte-identical-trigger
technique, `pac code push`, Azure deploys). The following **remain the operator's** because they need a
role or action Claude can't (and shouldn't) hold:

- **Granting Entra admin consent** (Application Administrator / Privileged Role Administrator).
- **Injecting secrets Claude lacks** into Key Vault (production EVA/DVSA/Box credentials).
- **Live email sends** and the final "did the inbox fire" confirmation (Exchange + a real send).
- **Box Admin Console** authorization (CCG, File Request template, webhook) on a business account.
- **The final live-confirm** of any outward-facing change.

See [docs/gated.md](./gated.md) for the per-item blocker registry and current state.
