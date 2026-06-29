# 11 — Secrets & Key Vault

Key Vault is **already Azure** and stays. The job is to repoint the new Function Apps at the existing vaults
via managed identity, and to carry forward the "no secret in the browser" invariant. **Phase P1 (grants) +
P2 (references).** Verified against Microsoft Learn (topics named inline).

## Vaults (3 existing kept + 1 new break-glass)
| Vault | State | Holds |
|---|---|---|
| `cespkenrichkvgi62sd` | **Populated** | `DVSA_CLIENT_ID`, `DVSA_CLIENT_SECRET`, `DVSA_API_KEY`, `DVLA_API_KEY` — used by the **enrichment** Function (unchanged) |
| `cespkevakvufa3ci` | Empty (gated) | reserved for EVA creds (`eva-client-id`, `eva-client-secret`) when `EVA_API_ENABLED` flips |
| `cespkboxkvv76a47` | Empty (gated) | reserved for Box (`box-client-secret`, webhook keys) when `BOX_API_ENABLED` flips |
| `cespk-pg-kv-dev` | **New** (created by `provision.sh`, RBAC, UK South) | the **break-glass Postgres DB-admin password** secret `pg-admin-password` — generated with `openssl`, written straight to KV (never echoed, never in the repo). This is the **only home** for the DB-admin password; see [`20`](./20-data-and-schema-migration.md) and [`21`](./21-backend-api-build.md) |

The existing 6 Functions keep their existing vault wiring untouched. The **two new Function Apps**
(Data API, Orchestration) need new grants, and `cespk-pg-kv-dev` is newly created — but each app is granted
**only the vaults it actually reads** (the Data API reads `cespk-pg-kv-dev`; see *Grant pattern* below).

> **Why a dedicated `cespk-pg-kv-dev` and not the enrichment vault.** The DB-admin password must **not** land in
> `cespkenrichkvgi62sd` — that vault stays exclusively the enrichment Function's (see invariant *"One vault per
> concern"*). The break-glass credential gets its own RBAC vault so its read-grant (the Data API's MI) never
> widens access to the live DVSA/DVLA secrets. This supersedes the "`cespkenrichkvgi62sd` or a new `cespk` vault"
> phrasing in earlier drafts of [`20`](./20-data-and-schema-migration.md): the enrichment-vault option is **not**
> permitted.

The **two secret env-vars** from the manifest map straight onto the EVA vault (the only secrets either new app
touches, and only once gated on):

| Manifest var (`cr1bd_`) | Type | Vault | Secret name | Consumed by |
|---|---|---|---|---|
| `EVA_CLIENT_ID` | Secret | `cespkevakvufa3ci` | `eva-client-id` | Data API / Orchestration EVA path (gated `EVA_API_ENABLED`) |
| `EVA_CLIENT_SECRET` | Secret | `cespkevakvufa3ci` | `eva-client-secret` | same |

## What the new apps need
- **Data API** — the Postgres connection (prefer **Entra/managed-identity auth to Postgres**, so *no DB
  password secret at all* on the hot path). The **break-glass admin password** is nonetheless stored in
  `cespk-pg-kv-dev` (secret `pg-admin-password`); if the Data API ever falls back to password auth it
  KV-references that secret out of `cespk-pg-kv-dev` (**never** the enrichment vault). No other secrets
  in M1 — EVA secrets stay gated.
- **Orchestration** — Graph app credentials for the **app-only token** the intake daemon uses to
  **delta-poll** its mailboxes. The daemon holds **no Entra Graph permission**: its mailbox access is
  granted by **Exchange RBAC for Applications** (an Exchange Administrator scopes the resource-scoped
  mailbox roles — **no Global Admin**; see [`22` §A](./22-orchestration-migration.md)), so the credential
  authenticates the app but carries no Graph application role. Prefer a **federated credential / managed
  identity** for Graph app-only auth where possible; otherwise a client secret in a vault, referenced.
  EVA/Box secrets stay gated (their vaults stay empty until those gates flip).

## Grant pattern (managed identity → Key Vault Secrets User)
All three vaults must be RBAC-authorization vaults (`--enable-rbac-authorization true`) for the **Key Vault
Secrets User** built-in role to apply; the alternative is a vault access policy granting `Get` secrets. Per
Microsoft Learn *"Use Key Vault references as app settings in Azure App Service, Azure Functions, and Azure
Logic Apps (Standard)"* → **Grant your app access to a key vault**, the RBAC path is: assign **Key Vault
Secrets User** to the app's managed identity.

```bash
RG=rg-collisionspike-dev
APP=<app-name>                 # the new Data API or Orchestration Function App
VAULT=cespkevakvufa3ci         # EVA vault (only assign the vaults the app actually reads)

# 1) enable a system-assigned identity on the app (KV references use it by default)
az functionapp identity assign -g "$RG" -n "$APP"
PRINCIPAL=$(az functionapp identity show -g "$RG" -n "$APP" --query principalId -o tsv)

# 2) assign Key Vault Secrets User on the vault scope (role by display name; GUID below for IaC)
VAULT_ID=$(az keyvault show -n "$VAULT" --query id -o tsv)
az role assignment create \
  --assignee-object-id "$PRINCIPAL" --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" \
  --scope "$VAULT_ID"
```
- **`--assignee-object-id` + `--assignee-principal-type ServicePrincipal`** is preferred over `--assignee` for
  a freshly-created managed identity — it skips a Graph lookup that can fail with replication lag right after
  `identity assign`.
- **Key Vault Secrets User** role definition GUID (for Bicep/ARM `roleDefinitionId`):
  `4633458b-17de-408a-b874-0445c86b69e6`. Learn confirms **Secrets User** (data-plane secret *read*) is the
  correct least-privilege role — *not* **Key Vault Reader** (control-plane metadata only, insufficient on its
  own) and *not* **Secrets Officer** (write/manage, too broad for an app that only reads).
- Grant **only the vaults an app reads**: the Data API is granted **Key Vault Secrets User on
  `cespk-pg-kv-dev`** (so it can read `pg-admin-password` for the password-auth fallback — provision.sh does
  `grant_secrets_user "$API_APP" "$PG_VAULT"`), plus the EVA vault only when `EVA_API_ENABLED` flips; the
  Orchestration app needs the EVA vault on the EVA-flip condition. The operator (deploying identity) holds
  **Key Vault Secrets Officer** on `cespk-pg-kv-dev` so `provision.sh` can *write* `pg-admin-password`
  (Officer = data-plane write; Secrets User = read-only). Neither new app needs `cespkenrichkvgi62sd` — that
  stays exclusively the enrichment Function's, and the DB-admin password lives in `cespk-pg-kv-dev`, never
  the enrichment vault.

## Reference pattern (KV reference as an app-setting)
Verified syntax (Learn *"Use Key Vault references as app settings…"* → **Understand source app settings from
Key Vault**): a Key Vault reference is `@Microsoft.KeyVault({referenceString})` where `{referenceString}` is
either `SecretUri=<full-data-plane-secret-uri>` or `VaultName=<v>;SecretName=<s>[;SecretVersion=<ver>]`. Set
the secret app-setting's **value** to the reference; the runtime resolves it using the app's identity, no code
change:

```bash
az functionapp config appsettings set -g "$RG" -n "$APP" --settings \
  EVA_CLIENT_ID='@Microsoft.KeyVault(SecretUri=https://cespkevakvufa3ci.vault.azure.net/secrets/eva-client-id/)' \
  EVA_CLIENT_SECRET='@Microsoft.KeyVault(SecretUri=https://cespkevakvufa3ci.vault.azure.net/secrets/eva-client-secret/)'
```
- **Versionless URI** (no trailing version GUID, as above) enables automatic rotation — the reference always
  resolves the current secret version. Pin a version only if you must.
- Uses the app's **system-assigned** identity by default; to use a **user-assigned** identity instead, set the
  app's `keyVaultReferenceIdentity` to that identity's resource id:
  ```bash
  UAMI_ID=$(az identity show -g "$RG" -n <uami-name> --query id -o tsv)
  az functionapp update -g "$RG" -n "$APP" --set keyVaultReferenceIdentity="$UAMI_ID"
  ```
- **Flex Consumption auto-routes outbound vnet traffic**, so for a network-restricted vault no extra
  `vnetRouteAllEnabled=true` step is needed (Learn explicitly carves out Flex Consumption from the
  vnet-route-all requirement; our vaults are not network-restricted today anyway).
- These two settings are **applied separately from** the gate block in [`10`](./10-settings-migration.md) §1.2,
  and **only when `EVA_API_ENABLED` flips** — exactly mirroring the manifest's "value injected by the user
  ([RESERVED-FOR-USER])" rule. Don't pre-set them while the EVA vault is empty (the reference would fail to
  resolve and the literal `@Microsoft.KeyVault(...)` string would be handed to code).

## Invariants
- **No secret in the SPA bundle.** The browser only ever holds an Entra token. Every credential lives in the
  Function Apps + Key Vault — the server-side continuation of the old CSP `connect-src 'none'` boundary.
- **Gated secrets stay absent.** Don't pre-populate the EVA/Box vaults during migration; they fill only when
  their gate flips, exactly as today. The reference app-settings above are likewise applied at flip time, not
  at provisioning.
- **One vault per concern.** Keep the per-Function vault split (don't collapse into one shared vault —
  Functions secret-storage can collide across apps sharing a vault). The two new apps **read** the EVA vault
  but never own it.
- **Prefer no secret at all where possible.** MI-to-Postgres and a Graph federated credential remove two
  would-be secrets entirely; reach for a KV-referenced secret only when an identity-based path isn't available.
