# Playbook — Postgres ops (RLS, app.role, audit)

**When to use.** Query or change `cespk-pg-dev` / db `collisionspike` (the system of record), apply schema,
inspect RLS, or debug a DB-auth failure.

**Platform ([routing table](./README.md)):** **WSL** — `psql` 16 and the logged-in `az` (token mint +
the transient firewall-rule dance) live there; delta files are reachable at `/mnt/c/…/migration/assets/
schema/deltas/`. Wrap the whole rule-create → psql → rule-delete sequence in one `wsl -e bash -lc` script
with a `trap cleanup EXIT` so the firewall rule can never be left behind.

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
  they read `current_setting('app.role')`. Ref [azure-api-deploy-and-auth](../../memory/azure-api-deploy-and-auth.md).
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

## Inbound dashboard-count health probe

`GET /api/inbound/counts` is a protected staff endpoint. A no-token request must return `401`; that
proves only the authentication boundary. For the functional probe, reload the signed-in dashboard and
require the request to return `200` with every `InboundCounts` key. Never convert a failed read into
zero counts in a probe or user interface.

Reconcile the four displayed values with [`.azure/verify-inbound-count-parity.sql`](../../.azure/verify-inbound-count-parity.sql)
using the `cespk_app` policy shape (`PGOPTIONS='-c app.role=staff'`). A workstation query must use the
transient-firewall procedure above with `trap cleanup EXIT`; after the query, read the rules back and
require only `AllowAzureServices` to remain. Do not use an owner-only read as RLS proof.

When the endpoint fails, query the Data API's own Application Insights component in its backing Log
Analytics workspace:

```kusto
AppRequests
| where Url has "/api/inbound/counts"
| project TimeGenerated, Name, ResultCode, Success, OperationId
| order by TimeGenerated desc
```

Then correlate the failing `OperationId` in `AppTraces`. If the request name is
`inboundEmailById` and PostgreSQL reports `22P02` for UUID value `counts`, the literal route was
captured by the parameter route. The required registration is `inbound/{id:guid}` alongside the
literal `inbound/counts`; verify both in `az functionapp function list` before changing the query.
For a real count-query failure, expect the `inboundCountsFailed` event with an opaque correlation id;
technical detail stays in telemetry and must not be rendered to staff.
