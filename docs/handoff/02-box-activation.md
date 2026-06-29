# 02 — Box activation (JWT Server Auth) — auth wired, box-fn redeployed, gates reconciled

_Author: **box-activator** (board task #3) · Date: **2026-06-28** · Mode: **APPROVED LIVE Azure changes applied**_
_Scope: `rg-collisionspike-dev` (uksouth), sub `e6076573-23a5-46a8-acef-7e22d264e5db`._

**TL;DR — Box is now LIVE.** The live smoke-test `GET /api/box/folders/392761581105/items` returns
**HTTP 200** listing folder `CCPY26050`. The earlier 502 was **not** simply "vault empty" — it was a
**stale box-fn deployment** running the old CCG-era `box_client.py`, which ignored `BOX_CONFIG_JSON`.
Fix = set the `box-config-json` KV secret + `BOX_CONFIG_JSON` app-setting **and redeploy box-fn**.
`BOX_*` gates reconciled onto `cespk-api-dev` + `cespk-orch-dev`. Remaining work is **Box-side only**
(File-Request template id, `FILE.UPLOADED` webhook subscription, prod scope-lock decision).

---

## Verified BEFORE-state (2026-06-28, start of task)

- **Box broken live:** `GET https://cespkbox-fn-v76a47.azurewebsites.net/api/box/folders/392761581105/items`
  → HTTP **502** `{"error":"Box rejected the service-identity token (is the app Admin-authorized?).", "status":400}`
  even though `BOX_API_ENABLED=true` on box-fn.
- **box-fn app-settings (BOX_*):** `BOX_API_ENABLED`, `BOX_API_BASE`, `BOX_UPLOAD_BASE`, `BOX_ENTERPRISE_ID`,
  `BOX_CLIENT_ID`, `BOX_ALLOWED_ROOT_ID`, `BOX_CLIENT_SECRET`, `BOX_WEBHOOK_PRIMARY_KEY`,
  `BOX_WEBHOOK_SECONDARY_KEY` — i.e. the **CCG-era** set. **No `BOX_CONFIG_JSON`.**
- **Vault `cespkboxkvv76a47`:** held only `box-client-secret`, `box-webhook-primary-key`,
  `box-webhook-secondary-key`. **No `box-config-json`.**
- **Gates on `cespk-api-dev` / `cespk-orch-dev`:** **no `BOX_*` settings at all** (Box treated as off).
- **Offline credential proof:** `python3 functions/box-webhook/tools/check_box_credentials.py
  941197_re7d6t50_config.json 392761581105` → token mint HTTP 200 + `GET /2.0/folders/392761581105` HTTP 200
  → **"BOX JWT AUTH WORKS END TO END"**. So the credentials were good; the live path was the problem.

## Root cause (conclusive)

`box_client.py` reads the whole `Config.JSON` from the **`BOX_CONFIG_JSON`** app-setting
(`BoxConfig.from_env`, `functions/box-webhook/box_client.py:203`). If `BOX_CONFIG_JSON` is absent, the
**current** code raises `BoxConfigError` → the route returns *"Box credentials are not configured."*
(`function_app.py:114`). But the live app returned *"Box rejected the service-identity token"*
(`BoxAuthError`, `function_app.py:118`) — which only happens when a token mint is **attempted and
rejected**. That is impossible for the current code with `BOX_CONFIG_JSON` absent.

Explanation: the **active box-fn deployment was 2026-06-27 01:00** (Kudu `/api/deployments`, deployer
`core_tools`, remoteBuild), which **predates commit `5eac80e` (2026-06-28 17:55)** that introduced
`BOX_CONFIG_JSON`/JWT into `box_client.py` (`git log -S BOX_CONFIG_JSON`). The deployed binary was the
**older CCG-era** client — it minted via `BOX_CLIENT_ID`/`BOX_CLIENT_SECRET` (client-credentials) which
Box now rejects (the app is JWT-only) → `BoxAuthError`. Setting the KV secret alone could never fix a
binary that doesn't read it.

## Commands run (exact)

```bash
# 0. Re-prove credentials offline (read-only)
python3 functions/box-webhook/tools/check_box_credentials.py 941197_re7d6t50_config.json 392761581105
# -> BOX JWT AUTH WORKS END TO END

# 1. Set the load-bearing KV secret (the whole Config.JSON)
az keyvault secret set --vault-name cespkboxkvv76a47 --name box-config-json \
  --file 941197_re7d6t50_config.json
# -> secret id .../secrets/box-config-json/285b5c83...

# 2. Wire it into box-fn as a KV reference
az functionapp config appsettings set -g rg-collisionspike-dev -n cespkbox-fn-v76a47 --settings \
  'BOX_CONFIG_JSON=@Microsoft.KeyVault(SecretUri=https://cespkboxkvv76a47.vault.azure.net/secrets/box-config-json)'

# 3. Compare config webhooks.* vs vault webhook-key secrets (values NEVER printed) -> primary MATCH, secondary MATCH
#    => no rotation needed.

# 4. Restart (then it still 502'd -> diagnosed stale deploy)
az functionapp restart -g rg-collisionspike-dev -n cespkbox-fn-v76a47

# 5. THE REAL FIX: redeploy box-fn with the current JWT code
cd functions/box-webhook && func azure functionapp publish cespkbox-fn-v76a47 --build remote --python
#    (remote Oryx build OK; func publish preserves app-settings)

# 6. Gates on the other two apps
for app in cespk-api-dev cespk-orch-dev; do
  az functionapp config appsettings set -g rg-collisionspike-dev -n $app --settings \
    BOX_API_ENABLED=true BOX_FOLDER_AT_INTAKE_ENABLED=true \
    BOX_FILEREQUEST_ENABLED=true BOX_FOLDER_ROOT_ID=392761581105
done
```

## Smoke-test — before / after

| | Result |
|---|---|
| **BEFORE** (and after KV-set + restart, still stale code) | HTTP **502** `{"error":"Box rejected the service-identity token...","status":400}` |
| **AFTER** (KV-set + `BOX_CONFIG_JSON` + **redeploy**) | HTTP **200** — `{"total_count":1,"entries":[{"type":"folder","id":"392816013365","name":"CCPY26050",...}]}` |

## Gate reconciliation (AFTER)

Both `cespk-api-dev` and `cespk-orch-dev` now carry:

| Setting | Value |
|---|---|
| `BOX_API_ENABLED` | `true` |
| `BOX_FOLDER_AT_INTAKE_ENABLED` | `true` |
| `BOX_FILEREQUEST_ENABLED` | `true` |
| `BOX_FOLDER_ROOT_ID` | `392761581105` |

`BOX_EMBED_ENABLED` and `BOX_METADATA_ENABLED` deliberately **left unset/off** (evidence is *linked* not
embedded — ADR-0012; metadata needs Box Business Plus).

> ⚠️ **Known fail-soft:** `BOX_FILEREQUEST_ENABLED=true` is set **without** `BOX_FILE_REQUEST_TEMPLATE_ID`.
> File-Request *copy* (`copy_file_request`) will therefore **no-op / fail-soft** until the operator supplies
> the template id. Folder-create + the upload-webhook path work regardless. This is expected, not a bug.

## Doc corrections made (Step 8)

- **`docs/azure/box-activation.md`** — rewrote the header (status now LIVE), added a prominent correction
  box (the "3 secrets / vault empty / purely mechanical" claims were wrong), inserted the **redeploy** step,
  fixed the config filename (`941197_re7d6t50_config.json`, not `941197__config.json`), and renumbered steps.
- **`CURRENT_STATUS.md`** — replaced the top "Box credentials PROVEN; activation staged; needs az login"
  banner with "Box is now LIVE", documenting the stale-deploy root cause and superseding the older
  "vault empty / no Box creds yet" lines below.
- **The forward worklist ([ROADMAP.md](../../ROADMAP.md); formerly `OPEN_ITEMS.md` §A, now merged in)** — flipped the "[OPERATOR → BUILD] Finish Box wiring (set 3 KV secrets)" items to
  **DONE**, corrected the "3 secrets" framing to the single load-bearing `box-config-json`, and narrowed the
  remaining Box work to Box-side items.

_(Banded-historical dated entries elsewhere in CURRENT_STATUS.md that still say "vault empty" are left as
provenance and are explicitly **superseded** by the new top banner.)_

---

## REMAINING — operator / Box-side (NOT done here, by design)

1. **File-Request template id → `BOX_FILE_REQUEST_TEMPLATE_ID`.** Hand-build the one template File Request
   in Box (with the `vehicle_registration` metadata), then set `BOX_FILE_REQUEST_TEMPLATE_ID` on
   `cespk-api-dev` + `cespk-orch-dev` (and box-fn if it mints File Requests). Until then File-Request copy
   no-ops (see fail-soft note above). Owner: `box-integration-architect`.
2. **`FILE.UPLOADED` webhook subscription.** Subscribe the webhook (per-root or per-case) pointing at
   `https://cespkbox-fn-v76a47.azurewebsites.net/api/box-webhook`. The receiver verifies the dual-key HMAC
   against `box-webhook-primary-key` / `-secondary-key` (already in the vault, already matching the config).
   Then run the end-to-end upload → evidence-attach → `box_upload_received` audit → status-re-eval test.
   This is the BLOCKING live-test for full intake activation.
3. **Production scope-lock decision (`BOX_ALLOWED_ROOT_ID`).** Currently `392761581105` (test folder) pins
   every op to that root. Clear it or repoint to the production archive root to go beyond the test folder.
4. **Local hygiene.** `941197_re7d6t50_config.json` (cleartext, gitignored) can be deleted now that KV holds
   it — left in place per task instruction (do NOT delete the local cred file).

## Notes / constraints respected

- Did **not** subscribe the `FILE.UPLOADED` webhook or create the File-Request template (operator/Box-side).
- Did **not** delete the local cred file. **Committed nothing.**
- Secret values were never printed to logs (webhook-key compare done by length/equality only).
