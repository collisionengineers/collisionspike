# Playbook — grant RBAC / managed identity

**When to use.** A Function App's managed identity needs access to a Key Vault, Storage account, or the
Data API; or you're assigning an Entra app role.

## Invoke first
1. **`azure:azure-rbac`** skill — pick the least-privilege role + generate the assignment (CLI **and**
   ARM/Bicep).
2. **`mcp__azure__role`** — list/inspect/assign roles.
3. Secrets that the grant unlocks → [secrets-keyvault.md](./secrets-keyvault.md).

## Procedure
1. Get the MI principal id: `az functionapp identity show -g rg-collisionspike-dev -n <app> --query principalId -o tsv`.
2. Pick the **least-privilege** role (e.g. **Key Vault Secrets User** `4633458b-17de-408a-b874-0445c86b69e6`,
   data-plane read-only — not Secrets Officer).
3. Assign at the **narrowest scope** (the specific vault/account), using `--assignee-object-id` +
   `--assignee-principal-type ServicePrincipal`.

## Gotchas (this project — important)
- **`az role assignment` returns `MissingSubscription` in this environment.** Grant roles via an
  **ARM template** (or `mcp__azure__role` / the portal), **not** the bare `az role assignment create`
  CLI. See [AGENTS.md](../../AGENTS.md) §Stack-specific tooling.
- **Always `--assignee-object-id <oid> --assignee-principal-type ServicePrincipal`** — the plain
  `--assignee` does a Graph lookup that **races** for a freshly-created MI (replication lag → "principal
  not found").
- **Durable (orch) needs three storage roles**, not one: **Storage Blob Data Owner + Queue Data
  Contributor + Table Data Contributor** on `cespkorchstdev01` (Blob alone can't run the task hub).
  Ref [azure-orch-deploy](../../memory/azure-orch-deploy.md).
- **Vaults must be RBAC-authorized** (`--enable-rbac-authorization true`) for the role to apply.
- **Entra app roles** on the API: `CollisionSpike.User` / `CollisionSpike.Superuser` (full; was `Admin`,
  same role-id) / `CollisionSpike.Engineer` (placeholder, not enforced). **Only one staff principal is
  assigned** — others reach the API and **403** until assigned. The orch MI also needs an app-role on the
  Data API at go-live. Ref [azure-api-deploy-and-auth](../../memory/azure-api-deploy-and-auth.md) · [`live-environment.md`](../architecture/live-environment.md).
- Use **PowerShell, not Git Bash**, for `az role`/scope args (MSYS mangles the leading-slash resource id).

## Best-practice refs (Microsoft Learn)
- Grant app access to Key Vault (assign Key Vault Secrets User to the MI): <https://learn.microsoft.com/azure/app-service/app-service-key-vault-references#grant-your-app-access-to-a-key-vault>
- Key Vault RBAC guide: <https://learn.microsoft.com/azure/key-vault/general/rbac-guide>

## Anti-churn checkpoint
If an assignment "isn't taking," it's almost always **MissingSubscription (use ARM)** or **MI replication
lag (use `--assignee-object-id`)** — fix the cause, don't retry the same CLI. RBAC propagation can also
take a few minutes; verify before re-issuing.

## Verify
`az role assignment list --assignee <oid> --scope <resource-id> -o table` shows the role; the app can read
the secret / reach the resource (re-check the failing call once propagation completes).
