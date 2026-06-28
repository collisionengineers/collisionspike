# Box activation — finish wiring the JWT credentials (playbook)

**Status as of 2026-06-28: credentials PROVEN working; only the Azure KV wiring remains.**

The Box app uses **JWT "Server Authentication"** (not CCG). On 2026-06-28 the operator generated a
fresh signing keypair and dropped the complete Box `Config.JSON` into the repo root
(`941197__config.json`, **gitignored**). It was verified end-to-end against `api.box.com`:

```
POST /oauth2/token            -> HTTP 200   (Service-Account token, ~72-min TTL)
GET  /2.0/folders/392761581105 -> HTTP 200   folder name='test folder', item_count=1
```

i.e. the private key decrypts with its passphrase, the RS512 assertion signs, **Box mints a token**
(so the app **is** Admin-Console authorized — no reauthorization needed), and the **Service Account is
already a collaborator** on the allowed root `392761581105`. The deployed `box_client.py` already
self-corrects the small host/Box clock skew via Box's `Date` header.

**What is left is purely mechanical:** the box-webhook Function (`cespkbox-fn-v76a47`) already has the
right app-settings as `@Microsoft.KeyVault(...)` references and its managed identity already holds
*Key Vault Secrets User* (see [`functions/box-webhook/infra/main.bicep`](../../functions/box-webhook/infra/main.bicep)).
Only the **secret values** are missing from the (empty) vault `cespkboxkvv76a47`. Set them, restart, test.

> Invoke first → `azure:azure-compliance` (KV-ref pattern) / `mcp__azure__keyvault`. See the
> anti-churn doctrine in [README.md](./README.md). Resource names: [`live-environment.md`](../architecture/live-environment.md).

---

## Prerequisite (the only blocker)

An **authenticated Azure CLI session**. The session token expired during the 2026-06-28 work
(`az` and the MCP credential chain both returned *"a token that does not exist"* / 401). Re-auth is
interactive, so the operator runs it once:

```
! az login
```

(The `!` prefix runs it in this session so the output lands in the conversation.) After that, every
step below is non-interactive.

---

## Step 1 — Set the three Key Vault secrets (one command)

The script reads the gitignored config, sets the three secrets in `cespkboxkvv76a47`, and restarts
the Function so the KV references re-resolve. Idempotent; touches nothing in Box.

```powershell
pwsh functions/box-webhook/infra/wire-box-secrets.ps1
```

It sets:

| KV secret (`cespkboxkvv76a47`) | Source field in `941197__config.json` | Consumed by box-fn app-setting |
|---|---|---|
| `box-config-json`          | the **whole** file (auth material) | `BOX_CONFIG_JSON` |
| `box-webhook-primary-key`  | `webhooks.primaryKey`   | `BOX_WEBHOOK_PRIMARY_KEY` |
| `box-webhook-secondary-key`| `webhooks.secondaryKey` | `BOX_WEBHOOK_SECONDARY_KEY` |

Manual equivalent (if you prefer not to run the script):

```powershell
az keyvault secret set --vault-name cespkboxkvv76a47 --name box-config-json --file 941197__config.json
az keyvault secret set --vault-name cespkboxkvv76a47 --name box-webhook-primary-key   --value <webhooks.primaryKey>
az keyvault secret set --vault-name cespkboxkvv76a47 --name box-webhook-secondary-key --value <webhooks.secondaryKey>
az functionapp restart -g rg-collisionspike-dev -n cespkbox-fn-v76a47
```

> If `BOX_CONFIG_JSON` / `BOX_WEBHOOK_*` app-settings are somehow **not** present on the live app (i.e.
> the infra was never deployed), set them as KV references — exact values are in `main.bicep` lines
> 246-258. The MI grant is the *Key Vault Secrets User* role on the vault (`main.bicep` line 268).

## Step 2 — Verify the references resolved

```powershell
az functionapp config appsettings list -g rg-collisionspike-dev -n cespkbox-fn-v76a47 `
  --query "[?contains(name,'BOX_')].{name:name,value:value}" -o table
```

The `BOX_CONFIG_JSON` / `BOX_WEBHOOK_*` rows should show the `@Microsoft.KeyVault(...)` syntax with **no**
"Key Vault Reference" resolution error.

## Step 3 — Live smoke-test (JWT mint + an authenticated Box REST call)

The `GET .../items` facade route mints the JWT token server-side and lists the allowed root
(`392761581105` short-circuits the scope lock, so this needs only working auth):

```powershell
$code = az functionapp keys list -g rg-collisionspike-dev -n cespkbox-fn-v76a47 --query functionKeys.default -o tsv
curl -s "https://cespkbox-fn-v76a47.azurewebsites.net/api/box/folders/392761581105/items?code=$code"
```

- **HTTP 200 + a JSON item list** → Box is live. ✅
- **502 `{"error":"Box rejected the service-identity token..."}`** → app not Admin-authorized. It **is**
  (proven 2026-06-28); if this appears, the secret value in `box-config-json` is wrong/truncated — re-run Step 1.
- **502 `{"error":"Box credentials are not configured."}`** → the `box-config-json` secret is missing/empty.

You can re-prove the credentials **offline at any time** (no Azure needed) with the durable diagnostic —
it mirrors `box_client.py`'s mint exactly and is read-only:

```
python functions/box-webhook/tools/check_box_credentials.py [config.json] [allowed-root-id]
```

(Defaults to the repo-root `941197__config.json` and root `392761581105`. Expect `... HTTP 200` twice and
`BOX JWT AUTH WORKS END TO END`.)

## Step 4 — Reconcile the `BOX_*` gates across the other two apps

The box-fn is gated on (`BOX_API_ENABLED=true`), but the **Data API** (`cespk-api-dev`) and
**orchestration** (`cespk-orch-dev`) had **no** `BOX_*` settings → they treat Box as off, so intake
never asks the box-fn to create a case folder / File Request. Add to **both** apps:

```powershell
foreach ($app in 'cespk-api-dev','cespk-orch-dev') {
  az functionapp config appsettings set -g rg-collisionspike-dev -n $app --settings `
    BOX_API_ENABLED=true `
    BOX_FOLDER_AT_INTAKE_ENABLED=true `
    BOX_FILEREQUEST_ENABLED=true `
    BOX_FOLDER_ROOT_ID=392761581105
}
```

Leave **`BOX_EMBED_ENABLED` off** (evidence is *linked*, not embedded — ADR-0012) and
**`BOX_METADATA_ENABLED` off** (needs Box Business Plus). _(Gate names verified 2026-06-28 against
`packages/domain`, the single source of truth: `BOX_API_ENABLED`, `BOX_FOLDER_AT_INTAKE_ENABLED`,
`BOX_FILEREQUEST_ENABLED`, `BOX_FOLDER_ROOT_ID`, `BOX_FILE_REQUEST_TEMPLATE_ID`, `BOX_EMBED_ENABLED`,
`BOX_METADATA_ENABLED`.)_

## Step 5 — Follow-ups (not blockers for basic activation)

- **File Request template id.** `copy_file_request` needs the id of the hand-built template File Request
  in Box (with the `vehicle_registration` metadata). Once it exists, set `BOX_FILE_REQUEST_TEMPLATE_ID`
  on the apps that mint File Requests. Until then, folder-create + the upload webhook work; File-Request
  copy does not. (Box-side task — see `box-integration-architect`.)
- **`FILE.UPLOADED` webhook.** Subscribe the webhook to the root (or per-case) pointing at
  `https://cespkbox-fn-v76a47.azurewebsites.net/api/box-webhook`; the receiver verifies the dual-key
  HMAC against the two secrets set in Step 1. Exercise an upload → evidence-attach → `box_upload_received`
  audit → status re-eval.
- **Scope lock for production.** `BOX_ALLOWED_ROOT_ID=392761581105` pins every op to the test folder.
  Clear it (or repoint to the production archive root) to lift the lock when going beyond the test folder.
- **Local hygiene.** After Step 1, the secret lives in Key Vault; the repo-root `941197__config.json`
  can be deleted. It is gitignored (`.gitignore`: `*__config.json`) so it will never be committed, but it
  is cleartext on disk — remove it once KV is set.

---

## Security notes

- `941197__config.json` holds the **RSA private key, passphrase, client secret, and webhook keys** in
  cleartext. It is **gitignored** and must **never** be committed; its only durable home is Key Vault.
- The box-fn never logs the token/key/secret; `__repr__` is redacted; the credential POST is host-pinned
  to `*.box.com` (`box_client._assert_box_token_host`). Do not relax these.
