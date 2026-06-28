# Playbook — secrets / Key Vault / rotation

**When to use.** Store, rotate, or reference a secret; switch a connection to identity-based; audit Key
Vault for expiring secrets. **Never** put a plaintext secret in an app-setting — and never hold or echo a
vendor secret (the operator injects those).

## Invoke first
1. **`azure:azure-compliance`** — Key Vault expiry/secret audit + posture checks.
2. **`mcp__azure__keyvault`** — set/read/manage secrets.
3. The MI must be able to read the vault → [identity-rbac.md](./identity-rbac.md).

## The vaults (this project)
- **`cespk-pg-kv-dev`** — Postgres `cespk_app`/admin passwords, the rotated **`graph-client-secret`**, and
  the retained **`parser-fn-key` / `enrich-fn-key` / `boxwebhook-fn-key`**.
- **`cespkenrichkvgi62sd`** — DVSA/DVLA secrets (populated, resolving).
- **`cespkboxkvv76a47`** (Box) + the EVA vault — **empty, gated** until activation.
Names: [`live-environment.md`](../architecture/live-environment.md).

## Procedure
1. `az keyvault secret set --vault-name <vault> --name <secret> --value <…>` (operator-supplied; never
   from the repo).
2. Reference it from the app: `@Microsoft.KeyVault(SecretUri=https://<vault>.vault.azure.net/secrets/<name>/)`
   (this repo also uses the `@Microsoft.KeyVault(VaultName=<v>;SecretName=<n>)` form).
3. Ensure the app's MI has **Key Vault Secrets User** ([identity-rbac.md](./identity-rbac.md)).

## Gotchas (load-bearing — caused a real outage)
- **Rotation + versionless ref = stale secret.** A **versionless** `@Microsoft.KeyVault(SecretUri=.../<name>/)`
  served the **old cached version** after rotation — even across `az functionapp restart` and a `func
  publish` — so the API kept sending the old Postgres password → every query failed. **Fix: pin the
  VERSIONED SecretUri** (`.../secrets/<name>/<versionId>`) to force immediate re-resolution. Trade-off: a
  later rotation must re-point. Ref [azure-api-deploy-and-auth](../../memory/azure-api-deploy-and-auth.md).
- **Identity-based connections (Functions 4.x):** when a setting feeds an MI connection, the key separator
  is `:` or `/`, **not `__`** (e.g. `Storage1:blobServiceUri`). Storage uses `AzureWebJobsStorage__accountName`
  with `allowSharedKeyAccess=false`. Ref [azure-orch-deploy](../../memory/azure-orch-deploy.md).
- **A 403 SecretGet from the app's public IP followed by a success from its private IP is *by design*** —
  don't chase it as a failure.
- **Don't pre-deploy a gate's secret into an empty vault** — inject only when the gate flips, or the KV
  reference fails to resolve.
- A KV-reference typo hands the literal `@Microsoft.KeyVault(...)` string to code → a 5xx; check App
  Insights for "Key Vault reference" resolution errors ([logs-kql.md](./logs-kql.md)).

## Best-practice refs (Microsoft Learn)
- Key Vault references for App Service/Functions: <https://learn.microsoft.com/azure/app-service/app-service-key-vault-references>
- Identity-based connections: <https://learn.microsoft.com/azure/azure-functions/functions-reference#connections>
- Securing Functions (secrets): <https://learn.microsoft.com/azure/azure-functions/security-concepts>

## Anti-churn checkpoint
If an app "can't read a secret," check the **3 usual causes** before retrying: (1) MI missing **Key Vault
Secrets User**, (2) **versionless ref** serving a stale value post-rotation, (3) a reference typo. Fix the
cause; don't re-`restart` in a loop.

## Verify
`mcp__azure__keyvault` (or `az keyvault secret show`) returns the expected version; the app's failing call
returns 200 after the reference resolves (App Insights shows no KV-reference error).
