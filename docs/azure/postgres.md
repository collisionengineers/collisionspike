# Playbook — Postgres ops (RLS, app.role, audit)

**When to use.** Query or change `cespk-pg-dev` / db `collisionspike` (the system of record), apply schema,
inspect RLS, or debug a DB-auth failure.

## Invoke first
1. **`mcp__azure__postgres`** — server/database/query operations against the Flexible Server.
2. **`psql`** for DDL/seed (`migration/assets/schema/*.sql`).
3. DB-auth / KV-password issues → [secrets-keyvault.md](./secrets-keyvault.md); the connection's MI →
   [identity-rbac.md](./identity-rbac.md).

## Connect
```bash
# Entra token auth (preferred) — note the resource type:
PGPASSWORD=$(az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv)
psql "host=cespk-pg-dev.postgres.database.azure.com port=5432 dbname=collisionspike sslmode=require user=<entra-or-csadmin>"
```
The Data API connects as the **non-owner login `cespk_app`** (password = KV ref), with the DB app-role set
per-connection via libpq **`-c app.role=staff`** (`PGAPPROLE`). Names/counts: [`live-environment.md`](../architecture/live-environment.md).

## Gotchas (this project)
- **RLS only bites as `cespk_app`.** The owner/admin `csadmin` **bypasses RLS** — so a query that "works"
  as csadmin proves nothing about policy. Verify policies with `SELECT * FROM pg_policies WHERE tablename=…`;
  they read `current_setting('app.role')`. Ref [[azure-api-deploy-and-auth]].
- **`app.role` is a libpq startup option, not `SET LOCAL`.** It's set in the `pg.Pool` `options`
  (`-c app.role=staff`) — Azure Flexible Server forbids a non-superuser persisting a role-default GUC
  ("permission denied to set parameter"). A future admin-delete path uses a **separate pool** with
  `-c app.role=admin` gated on a Superuser token.
- **`audit_event` is append-only** (INSERT/SELECT grants only; **no DELETE anywhere**) — an `UPDATE
  audit_event` / `DELETE case_` as `cespk_app` is *denied by design*, not a bug.
- **`csadmin` can't name `NOSUPERUSER`/`NOBYPASSRLS` in `ALTER ROLE`** — but `CREATE ROLE … LOGIN` already
  defaults to that shape; set only LOGIN + PASSWORD.
- **Workstation DDL** needs a transient firewall rule (`az postgres flexible-server firewall-rule create
  -s cespk-pg-dev …`) — then delete it; only `AllowAzureServices` (0.0.0.0) should remain.
- **`password authentication failed`** with auth otherwise fine → a **versionless KV ref** serving the
  stale password after rotation; pin the versioned SecretUri ([secrets-keyvault.md](./secrets-keyvault.md)).

## Best-practice refs
- Flexible Server Microsoft Entra auth + RLS: search `microsoft-docs:microsoft-docs` for
  "Azure Database for PostgreSQL flexible server Microsoft Entra authentication" / "row level security".

## Anti-churn checkpoint
A DB-auth failure is almost always a **secret/KV-ref** problem ([secrets-keyvault.md](./secrets-keyvault.md)),
not the query. An RLS "surprise" is usually **connected as the wrong role** (csadmin bypasses). Diagnose
the role/secret before rewriting SQL.

## Verify
As `cespk_app`: `/api/dashboard/*` + `/api/queues/*/cases` return 200; `DELETE FROM case_` and
`UPDATE audit_event` are **denied**. Table count `SELECT count(*) FROM information_schema.tables WHERE
table_schema='public'` → 36.
