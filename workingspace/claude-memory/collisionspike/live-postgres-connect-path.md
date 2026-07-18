---
name: live-postgres-connect-path
description: How to connect to the live Postgres (cespk-pg-dev) with RLS-bypass for admin/backfill work
metadata: 
  node_type: memory
  type: reference
  originSessionId: 27d4aca4-d9aa-4181-ae51-7349306f6f78
---

To read/write the live Postgres **bypassing RLS** (for audits/backfills), connect from **WSL** as the
**Entra admin** (the signed-in `digital@collisionengineers.co.uk` IS the server's Microsoft-Entra admin)
and `SET ROLE csadmin` at the top of the session — the Entra admin is a member of `csadmin` (owner), so
`SET ROLE csadmin` works and bypasses RLS. A plain (non-role-set) Entra read returns **0 rows** (RLS).

- Token: `PGPASSWORD=$(az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv)`;
  user=`digital@collisionengineers.co.uk`.
- **Do NOT use the `csadmin` password** in KV `cespk-pg-kv-dev/pg-admin-password` — BOTH versions are
  **stale** (rotated, KV not updated); `password authentication failed`. Use the Entra-admin + SET ROLE path.
- Workstation needs a transient firewall rule: `az postgres flexible-server firewall-rule create -g
  rg-collisionspike-dev --name cespk-pg-dev --rule-name <r> --start-ip-address <ip> --end-ip-address <ip>`
  (note: this CLI version wants `--name`=server + `--rule-name`, NOT `-s`/`-r`). Always trap-delete it.
- **Calling the Data API over HTTP is blocked**: `az account get-access-token --resource <api-client-id
  fa2fb28c…>` fails **AADSTS65001** (az CLI not consented to the API app). To drive internal routes like
  `status-evaluate`, either the user runs an interactive `az login --scope "fa2fb28c…/.default"`, or
  reproduce the domain logic in SQL. `withServiceAuth` only checks the audience (no app-role). See
  [[live-postgres-connect-path]].
