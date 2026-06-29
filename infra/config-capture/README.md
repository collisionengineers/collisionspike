# `infra/config-capture/` — live Azure config as reviewable IaC

**Purpose (OPEN_ITEMS §A3).** Capture the live, **hand-applied** Azure configuration of
`rg-collisionspike-dev` as version-controlled Infrastructure-as-Code, so the app-settings, the
managed-identity RBAC, the feature gates, and the Key-Vault-reference wiring are no longer tribal
knowledge — and so the P0 / role / secret state is auditable in git.

**This is a CAPTURE, not a green-field deploy.** The Function Apps, their plans, host Storage
accounts, and Key Vaults were created by hand during the Power-Platform→Azure migration. These
templates therefore reference that infra as `existing` (by name) and capture only the **config
surface** layered on top. They **build offline** (`az bicep build`, all three clean, zero warnings)
but were **NOT** deployed or `what-if`-ed against live in the capture task — applying is a later,
reviewed operator step (see *How to apply later*).

Verified live **2026-06-28**, post Box-activation (`BOX_*` gates now `true`) and post the P0
DB-security fix (API connects as the non-owner login `cespk_app`).

## Files

| File | Captures |
|---|---|
| `api.bicep`  | Data API `cespk-api-dev` — 16 app-settings, the `cespk_app` Postgres login wiring, the `PGPASSWORD` KV ref, gates, + 2 role assignments (KV Secrets User, Storage Blob Data Owner). |
| `orch.bicep` | Orchestration `cespk-orch-dev` — 25 app-settings (Graph intake, retained-fn URLs+KV-ref keys, evidence-blob, gates) + **5** role assignments (the widest MI in the RG). |
| `spa.bicep`  | Static Web App `cespk-spa-dev` — Free SKU, host, and the fact that it has **no** SWA app-settings (MSAL config lives in the app + Entra, not here). |
| (box-fn)     | **Already captured** at [`functions/box-webhook/infra/main.bicep`](../../functions/box-webhook/infra/main.bicep) — that template is the IaC for `cespkbox-fn-v76a47` (Box `Config.JSON` KV ref, webhook keys, gates, MI roles). Not duplicated here. |

## How it maps to live

- **Resource group:** `rg-collisionspike-dev` (uksouth), subscription `e6076573-…` (Azure Free Trial).
- **Two Key Vaults:**
  - `cespk-pg-kv-dev` — `cespk-app-password` (API), `graph-client-secret`, `parser-fn-key`,
    `enrich-fn-key`, `boxwebhook-fn-key` (orch).
  - `cespkboxkvv76a47` — `box-config-json`, `box-client-secret`, `box-webhook-primary-key`,
    `box-webhook-secondary-key` (box-fn; captured in the box-webhook template).
- **KV-reference forms preserved as-found:** the `SecretUri=…` form (API password, Graph secret) and
  the `VaultName=…;SecretName=…` form (the three orch fn-keys). Both resolve via the Function MI.
- **Managed identities (all SystemAssigned) → role assignments (captured live):**

  | Identity (app) | Role | Scope |
  |---|---|---|
  | `cespk-api-dev` | Key Vault Secrets User | KV `cespk-pg-kv-dev` |
  | `cespk-api-dev` | Storage Blob Data Owner | SA `cespkapistdev01` |
  | `cespk-orch-dev` | Key Vault Secrets User | KV `cespk-pg-kv-dev` |
  | `cespk-orch-dev` | Storage Blob Data Owner | SA `cespkorchstdev01` |
  | `cespk-orch-dev` | Storage Queue Data Contributor | SA `cespkorchstdev01` |
  | `cespk-orch-dev` | Storage Table Data Contributor | SA `cespkorchstdev01` |
  | `cespk-orch-dev` | Storage Blob Data Contributor | SA **`cespkevidstdev01`** (live evidence store) |
  | `cespkbox-fn-v76a47` | Key Vault Secrets User | KV `cespkboxkvv76a47` |
  | `cespkbox-fn-v76a47` | Storage Blob Data Owner | SA `cespkboxstv76a47` |

- **Gate state captured:** `PDF_MAPPER_ENABLED=true`, `ENRICHMENT_ENABLED=true`,
  `BOX_API_ENABLED=true`, `BOX_FOLDER_AT_INTAKE_ENABLED=true`, `BOX_FILEREQUEST_ENABLED=true`
  (the `BOX_*` set was flipped on by box-activator 2026-06-28).

## How to apply later (reviewed operator step — not run in the capture task)

1. **Inject the secret values first** (out of band, never in these files): the four/five KV secrets
   above must already exist in the two vaults (they do, live). These templates only declare the
   *references*.
2. **Validate, don't mutate, first:**
   ```
   az deployment group what-if -g rg-collisionspike-dev --template-file orch.bicep \
     --parameters appInsightsConnectionString=<secure>
   ```
   (Per `docs/azure/identity-rbac.md`, `az role assignment` 500s `MissingSubscription` in this
   environment — grant/replay the role assignments via the **ARM/bicep deployment**, not the CLI verb.
   The role-assignment resources here use `guid(...)` names so re-applying is idempotent.)
3. **App-settings are guarded.** Each template has `param applyAppSettings bool = false`. Capture/RBAC
   runs leave it **false** (no settings mutation). Only a deliberate, reviewed run sets it `true` — and
   note that writing `Microsoft.Web/sites/config/appsettings` **REPLACES the entire app-settings
   collection**, so confirm the captured list is complete-vs-live (it was, on 2026-06-28) before doing so.
4. **App Insights connection string** is a `@secure()` param with an empty default — pass the live value
   at deploy time; it is never stored in the repo.

## What this capture does NOT cover (operator-owned gaps)

- **The Exchange-RBAC mailbox grant** for live email intake (`grant-exo-rbac-intake.ps1`) — an Exchange
  admin action via `New-ServicePrincipal` / `New-ManagementScope` / `New-ManagementRoleAssignment`.
  Not an ARM/bicep surface; cannot be expressed here. (OPEN_ITEMS §A1 / A* WS1b.)
- **The live evidence Blob store `cespkevidstdev01`** — its **store-level hardening** (blob soft-delete,
  versioning, container-delete retention) is **not in any IaC**; only the orch MI's *role* to it is
  captured here. Hardening the store itself remains an operator step (OPEN_ITEMS §A4 / Phase-9 G6).
- **Secret VALUES** — by design. Only names + `@Microsoft.KeyVault(...)` reference structure are captured.
- **Staff Entra app-role ASSIGNMENT** (`CollisionSpike.User` / `.Superuser`) — an Entra directory action,
  not RG IaC; one principal assigned, others 403 until assigned (OPEN_ITEMS §A2 / A* WS6).
- **The SWA MSAL config** (client id, scopes, allowed roles) — lives in the app's
  `staticwebapp.config.json` + the Entra app registration, not in SWA app-settings.
- **Underlying infra topology** (plan SKU/FC1, storage hardening flags, KV purge-protection) — these
  templates reference those resources as `existing`; the per-function-host bicep under
  `functions/*/infra/` + `ocr/infra/` remains the authoring source for that infra. `httpsOnly` /
  `minTlsVersion` returned `null` from the live `functionapp show` query and are not asserted here.
