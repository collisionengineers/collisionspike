---
name: azure-orch-deploy
description: How to build + deploy the Durable orchestration Function App (cespk-orch-dev) — incl. the esbuild import.meta.url bundle crash that left it with 0 functions, and identity-based storage for Durable
metadata:
  type: project
---

`cespk-orch-dev` is the TypeScript **Durable Functions** orchestration app (source `orchestration/`,
Node 20, `durable-functions` v3 + `@azure/functions` v4). It is deployed as a **single esbuild bundle**
`deploy/orch/main.cjs`, same shape as the Data API ([[azure-api-deploy-and-auth]]).

**THE BUG that kept it at ZERO functions (fixed 2026-06-27).** The orchestration source is ESM
(`"type":"module"`). esbuild bundling ESM→CJS leaves `import.meta.url` as **`undefined`**, and some
bundled dep calls `createRequire(import.meta.url)` → throws `ERR_INVALID_ARG_VALUE` at module load. The
Functions host then registers **0 functions** while still reporting `state: Running` (the entry module
crashed before any `app.*`/`df.app.*` registration ran). Tell-tale: a local `node -e "require('./deploy/orch/main.cjs')"`
crashes with that error. FIX = build via **`build-orch.cjs`** (esbuild JS API) with a banner+define:
`define: { 'import.meta.url': '__importMetaUrl' }` + `banner: { js: "const __importMetaUrl = require('url').pathToFileURL(__filename).href;" }`.
After the fix the bundle loads (test-mode warnings only) and the host registers **41 functions**.

**Build + deploy recipe (verified 2026-06-27):**
1. `npm run build --prefix orchestration` (tsc -b typecheck; builds `@cs/domain` too).
2. `node build-orch.cjs` (esbuild bundle with the import.meta.url fix; externals `@azure/functions` +
   `durable-functions`, bundles `@azure/storage-blob` + `@cs/domain`). esbuild binary is borrowed from
   `mockup-app/node_modules` (not installed at repo root).
3. **GOTCHA (same as the API):** `remotebuild=false` → the deploy zip MUST contain `node_modules`. Run
   `npm install --prefix deploy/orch --omit=dev` (installs the 2 externalized deps) BEFORE publishing.
4. Smoke: `node -e "require('./deploy/orch/main.cjs')"` — healthy = test-mode warnings + "LOADED OK" (NOT
   the createRequire crash).
5. `func azure functionapp publish cespk-orch-dev --javascript` from `deploy/orch/`. Verify with
   `az functionapp function list … --query "[].name"` → 41 functions (the `length(@)` form trips the
   Windows az.cmd paren-mangling — use `[].name` and count, never `length(@)`).

**Identity-based storage for the Durable host.** Switched off the plaintext storage connection strings
(`AzureWebJobsStorage` + `DEPLOYMENT_STORAGE_CONNECTION_STRING`) to the same identity-based pattern the 6
retained apps use: set `AzureWebJobsStorage__accountName=cespkorchstdev01`, PATCH
`functionAppConfig.deployment.storage.authentication.type=SystemAssignedIdentity` (the ARM PATCH needs the
FULL functionAppConfig incl. `runtime` + `scaleAndConcurrency` or it 400s "Runtime is invalid"), remove
both connection strings, `allowSharedKeyAccess=false`. Durable needs **Storage Blob Data Owner + Queue
Data Contributor + Table Data Contributor** on the storage account (Blob alone is not enough for the task
hub) — the host stays at 41 functions after the switch once those roles are granted.

**GOTCHA — `GRAPH_INTAKE_MAILBOXES` is JSON, not a CSV/plain string.** It is parsed as
`JSON.parse(...) as [{mailbox, minIntakeDate}]` (subscriptions.ts `intakeMailboxes()` + graph-lifecycle).
A plain value like `engineers@…` JSON-parse-throws → **zero mailboxes, silently** (intake never starts).
Correct: `[{"mailbox":"engineers@collisionengineers.co.uk","minIntakeDate":"2026-06-27T00:00:00Z"}, …]`
(set via a `--settings @file` to survive quoting). **Bootstrap:** `graph-renew` (12h timer) now
*ensure-creates* one subscription per configured mailbox (it was renew-only — nothing created the first
subscription, so intake could never start). Per Microsoft Learn the **push/subscription path works under
Exchange RBAC** (`Application Mail.Read` "has the same effect" as the Graph app permission; do NOT use
`Mail.Read.Shared`). Operator scopes the mailboxes via `C:\Users\Alex\grant-exo-rbac-intake.ps1`.
`EVIDENCE_BLOB_CONNECTION` stays unset until go-live (would be a plaintext storage key — prefer MI on
`cespkevidstdev01`).

**THE BIG GOTCHA that wasted ~50 min (2026-06-27) — RBAC-for-Applications PERMISSION CACHE.** After the
grant, Graph `POST /subscriptions` (and even `GET /users/{mbx}/messages`) kept returning **403
`ExtensionError … Access is denied. Check credentials`** while `Test-ServicePrincipalAuthorization`
showed `InScope=True`. The grant was CORRECT (verified: token `appid`/`oid` match the EXO `New-ServicePrincipal`,
role `Application Mail.Read`, scope filter matches). Root cause is documented in MS Learn *Role Based
Access Control for Applications in Exchange Online → Limitations §5*: **app-permission changes are cached
30 min – 2 h; the TEST command bypasses the cache (hence instant `True`), but live calls read the stale
pre-grant "deny". The cache of an app with NO inbound API calls resets after 30 min; an ACTIVE app keeps
the stale cache alive up to 2 h.** So **DO NOT poll/probe after granting** — every call (my graph-renew
fires + token probes) refreshed the 2 h active-cache and *prevented* the 30-min reset. CORRECT PROCEDURE:
grant → **leave the Graph app totally idle ≥30 min (no token probes, no graph-renew fires; no subscription
exists so nothing else calls Graph)** → then fire graph-renew **once**. (RBAC for Apps supports MS Graph +
EWS; `Application Mail.Read` = Graph `Mail.Read`. Restarting orch does NOT reset the cache — it is
server-side per-app on Microsoft's side.)

**Operational mechanics learned 2026-06-27:** (1) the grant script needs `Connect-ExchangeOnline -Device`
(device-code) and must be run in a REAL terminal, NOT via the `!` prefix — interactive WAM browser auth
fails "A window handle must be configured", and `-Device` blocks waiting for the code which `!` won't show
live. (2) Trigger the `graph-renew` timer on demand via the Functions admin API:
`POST https://cespk-orch-dev.azurewebsites.net/admin/functions/graph-renew` with header
`x-functions-key: <masterKey>` (from `az functionapp keys list … --query masterKey`) body `{"input":""}`
→ 202. (3) The `graph-webhook` validation handshake is verified working — POST `…/api/graph-webhook?validationToken=X`
(anonymous, no function key) returns 200 `text/plain` echoing `X`, so subscription-create won't fail the
Graph validation step once the cache clears.

**Wiring (deployed but NOT live).** App-settings: `PARSER_FN_URL`/`ENRICH_FN_URL`/`BOXWEBHOOK_FN_URL`
(+ keys as KV refs `@Microsoft.KeyVault(VaultName=cespk-pg-kv-dev;SecretName=parser-fn-key|enrich-fn-key|boxwebhook-fn-key)`),
`EVASENTRY_FN_URL`, `EVIDENCE_BLOB_CONTAINER`, `GRAPH_*` (secret a KV ref), gates. orch→Data API auth uses
the **managed identity** (`IDENTITY_ENDPOINT`), not a token in config. It is **deployed + wired but inert**:
no Graph subscriptions, the 3 real mailboxes are not Exchange-RBAC-scoped, `EVIDENCE_BLOB_CONNECTION` is
left unset (would be a plaintext connection string — prefer MI on `cespkevidstdev01` at go-live). Go-live
remainder: scope the mailboxes, set evidence-blob auth, assign orch MI an app-role on the Data API, wire
the Azure Monitor heartbeat alerts. See [[exchange-rbac-unblocks-graph-intake]].

**Playbook:** the canonical operational guides are [docs/azure/deploy.md](../docs/azure/deploy.md) +
[entra-graph.md](../docs/azure/entra-graph.md) (routing + anti-churn); this memory holds the deep gotchas
they link back to.
