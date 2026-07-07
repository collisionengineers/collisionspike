# Box activation — JWT credential wiring + the stale-deploy gotcha (playbook)

**Status as of 2026-06-28: Box is LIVE.** Auth wired, box-fn redeployed, live smoke-test HTTP 200,
gates reconciled. The activation record (before/after, exact commands) is
**[docs/handoff/02-box-activation.md](../handoff/02-box-activation.md)**.

> **Intake evidence archive — VERIFIED-LIVE (2026-07-01, [TKT-003](../tickets/done/TKT-003-box-sync/TKT-003-box-sync.md)).**
> After folder-at-intake, `cespk-orch-dev` runs the `boxArchiveEvidence` durable activity: reads persisted
> evidence via the Data API internal route and uploads bytes through box-fn `upload_file`. A fresh intake's
> case folder holds the `.eml`, instruction document(s), and images.

The Box app uses **JWT "Server Authentication"** (not CCG). On 2026-06-28 the operator generated a
fresh signing keypair and dropped the complete Box `Config.JSON` into the repo root
(`941197_re7d6t50_config.json`, **gitignored**). It was verified end-to-end against `api.box.com`:

```
POST /oauth2/token            -> HTTP 200   (Service-Account token, ~60-min TTL)
GET  /2.0/folders/392761581105 -> HTTP 200   folder name='test folder', item_count=1
```

i.e. the private key decrypts with its passphrase, the RS512 assertion signs, **Box mints a token**
(so the app **is** Admin-Console authorized — no reauthorization needed), and the **Service Account is
already a collaborator** on the allowed root `392761581105`. The deployed `box_client.py` already
self-corrects the small host/Box clock skew via Box's `Date` header.

> **⚠️ Correction to earlier drafts of this runbook.** Two claims here were WRONG and cost a debug cycle:
> 1. **"Just set 3 KV secrets / the vault is empty."** Only **one** secret was actually missing and
>    load-bearing: **`box-config-json`** (the whole `Config.JSON`, read by `box_client.py` via the
>    `BOX_CONFIG_JSON` app-setting). The two webhook-key secrets (`box-webhook-primary-key` /
>    `-secondary-key`) **already existed** in the vault and **already matched** the new config's
>    `webhooks` block — no rotation needed.
> 2. **"What's left is purely mechanical KV wiring."** Setting the secret was necessary but **not
>    sufficient**. The active box-fn deployment (2026-06-27 01:00) **predated** the commit that
>    introduced the JWT/`BOX_CONFIG_JSON` code (`5eac80e`, 2026-06-28 17:55). The deployed binary was the
>    **older CCG-era** `box_client.py` — it ignored `BOX_CONFIG_JSON`, minted via `BOX_CLIENT_ID` /
>    `BOX_CLIENT_SECRET`, and Box rejected it (502 `BoxAuthError`). The real fix was to **redeploy
>    box-fn** (Step 3). Tell: a stale (CCG) deploy returns *"Box rejected the service-identity token"*;
>    the current (JWT) code with an absent secret would instead return *"Box credentials are not
>    configured"*. Use that to distinguish the two.

> Invoke first → `azure:azure-compliance` (KV-ref pattern) / `mcp__azure__keyvault`. See the
> anti-churn doctrine in [README.md](./README.md). Resource names: [`live-environment.md`](../architecture/live-environment.md).

---

## Prerequisite

An **authenticated Azure CLI session** (`az login`). All steps below are non-interactive once authed.

---

## Step 1 — Set the load-bearing Key Vault secret

Only `box-config-json` was missing. (The webhook keys already matched — verify, don't blindly re-set.)

```bash
az keyvault secret set --vault-name cespkboxkvv76a47 --name box-config-json \
  --file 941197_re7d6t50_config.json
```

The box-fn already carries the consuming app-settings as `@Microsoft.KeyVault(...)` references and its
managed identity already holds *Key Vault Secrets User*:

| KV secret (`cespkboxkvv76a47`) | Source field in `941197_re7d6t50_config.json` | box-fn app-setting |
|---|---|---|
| `box-config-json`          | the **whole** file (auth material) | `BOX_CONFIG_JSON` |
| `box-webhook-primary-key`  | `webhooks.primaryKey`   | `BOX_WEBHOOK_PRIMARY_KEY` |
| `box-webhook-secondary-key`| `webhooks.secondaryKey` | `BOX_WEBHOOK_SECONDARY_KEY` |

If the `BOX_CONFIG_JSON` app-setting is absent (older infra rev — it was, on 2026-06-28), add it:

```bash
az functionapp config appsettings set -g rg-collisionspike-dev -n cespkbox-fn-v76a47 --settings \
  'BOX_CONFIG_JSON=@Microsoft.KeyVault(SecretUri=https://cespkboxkvv76a47.vault.azure.net/secrets/box-config-json)'
```

Verify the webhook keys before re-setting them (only rotate if they DIFFER):

```bash
# read webhooks.primaryKey / .secondaryKey from the config and compare to the vault values —
# do NOT echo the values to logs. See docs/handoff/02-box-activation.md for the exact compare.
```

## Step 3 — Redeploy box-fn (the step the old runbook missed)

The KV ref is inert if the deployed code is the CCG-era build. Redeploy from the repo so the JWT
(`BOX_CONFIG_JSON`) `box_client.py` is what actually runs:

```bash
cd functions/box-webhook
func azure functionapp publish cespkbox-fn-v76a47 --build remote --python
```

(`func publish` does **not** remove app-settings, so the KV ref from Step 1 survives.) Then restart is
implicit; allow ~30-60s for the KV reference to resolve before testing.

## Step 4 — Verify the references resolved

```powershell
az functionapp config appsettings list -g rg-collisionspike-dev -n cespkbox-fn-v76a47 `
  --query "[?contains(name,'BOX_')].{name:name,value:value}" -o table
```

The `BOX_CONFIG_JSON` / `BOX_WEBHOOK_*` rows should show the `@Microsoft.KeyVault(...)` syntax with **no**
"Key Vault Reference" resolution error.

## Step 5 — Live smoke-test (JWT mint + an authenticated Box REST call)

The `GET .../items` facade route mints the JWT token server-side and lists the allowed root
(`392761581105` short-circuits the scope lock, so this needs only working auth):

```powershell
$code = az functionapp keys list -g rg-collisionspike-dev -n cespkbox-fn-v76a47 --query functionKeys.default -o tsv
curl -s "https://cespkbox-fn-v76a47.azurewebsites.net/api/box/folders/392761581105/items?code=$code"
```

- **HTTP 200 + a JSON item list** → Box is live. ✅ (Confirmed 2026-06-28: lists folder `CCPY26050`.)
- **502 `{"error":"Box rejected the service-identity token..."}`** → a JWT/CCG mint was *attempted* and Box
  rejected it. The app **is** Admin-authorized (proven 2026-06-28), so the usual cause is a **stale (CCG)
  deploy** ignoring `BOX_CONFIG_JSON` — redeploy (Step 3). A wrong/truncated `box-config-json` value is the
  other possibility — re-run Step 1.
- **502 `{"error":"Box credentials are not configured."}`** → the CURRENT (JWT) code ran but the
  `box-config-json` secret / `BOX_CONFIG_JSON` setting is missing or didn't resolve.

You can re-prove the credentials **offline at any time** (no Azure needed) with the durable diagnostic —
it mirrors `box_client.py`'s mint exactly and is read-only:

```
python functions/box-webhook/tools/check_box_credentials.py [config.json] [allowed-root-id]
```

(Pass the repo-root `941197_re7d6t50_config.json` and root `392761581105`. Expect `... HTTP 200` twice and
`BOX JWT AUTH WORKS END TO END`.)

## Step 6 — Reconcile the `BOX_*` gates across the other two apps  ✅ DONE 2026-06-28

The box-fn is gated on (`BOX_API_ENABLED=true`), but the **Data API** (`cespk-api-dev`) and
**orchestration** (`cespk-orch-dev`) had **no** `BOX_*` settings → they treat Box as off, so intake
never asks the box-fn to create a case folder / File Request. Added to **both** apps:

```powershell
foreach ($app in 'cespk-api-dev','cespk-orch-dev') {
  az functionapp config appsettings set -g rg-collisionspike-dev -n $app --settings `
    BOX_API_ENABLED=true `
    BOX_FOLDER_AT_INTAKE_ENABLED=true `
    BOX_FILEREQUEST_ENABLED=true `
    BOX_FOLDER_ROOT_ID=392761581105
}
```

Evidence is *linked*, not embedded (ADR-0012) — the embed and metadata options were dropped, and
their gates removed from code (2026-07-03). _(Gate names verified against `packages/domain`, the
single source of truth: `BOX_API_ENABLED`, `BOX_FOLDER_AT_INTAKE_ENABLED`, `BOX_FILEREQUEST_ENABLED`,
`BOX_FOLDER_ROOT_ID`, `BOX_FILE_REQUEST_TEMPLATE_ID`.)_

## Step 7 — Follow-ups (REMAINING — operator / Box-side only)

- **File Request template id.** `copy_file_request` needs the id of the hand-built template File Request
  in Box (with the `vehicle_registration` metadata). Once it exists, set `BOX_FILE_REQUEST_TEMPLATE_ID`
  on the apps that mint File Requests. **`BOX_FILEREQUEST_ENABLED=true` is already set, so File-Request
  *copy* will no-op (fail-soft) until this id is supplied** — folder-create + the upload webhook work
  regardless. (Box-side task — see `box-integration-architect`.)
- **`FILE.UPLOADED` webhook.** Subscribe the webhook to the root (or per-case) pointing at
  `https://cespkbox-fn-v76a47.azurewebsites.net/api/box-webhook`; the receiver verifies the dual-key
  HMAC against the two webhook-key secrets (already in the vault, already matching). Exercise an upload →
  evidence-attach → `box_upload_received` audit → status re-eval.
- **Scope lock for production.** `BOX_ALLOWED_ROOT_ID=392761581105` pins every op to the test folder.
  Clear it (or repoint to the production archive root) to lift the lock when going beyond the test folder.
- **Local hygiene.** The secret now lives in Key Vault; the repo-root `941197_re7d6t50_config.json`
  can be deleted. It is gitignored so it will never be committed, but it is cleartext on disk — remove it
  once you are confident KV is the durable home.

---

## Security notes

- `941197_re7d6t50_config.json` holds the **RSA private key, passphrase, client secret, and webhook keys**
  in cleartext. It is **gitignored** and must **never** be committed; its only durable home is Key Vault.
- The box-fn never logs the token/key/secret; `__repr__` is redacted; the credential POST is host-pinned
  to `*.box.com` (`box_client._assert_box_token_host`). Do not relax these.
