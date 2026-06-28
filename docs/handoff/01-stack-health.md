# 01 — Live Azure stack health sweep (read-only)

_Author: **stack-doctor** (board task #2) · Date: **2026-06-28** · Mode: **STRICTLY READ-ONLY — nothing applied**_
_Scope: `rg-collisionspike-dev` (uksouth), sub `e6076573-23a5-46a8-acef-7e22d264e5db`._

**TL;DR verdict (full detail at the end): the live stack is HEALTHY for its current read-only + manual-create
posture.** All 8 Function Apps are `Running`, Postgres is `Ready`, and the core apps (`cespk-api-dev`,
`cespk-orch-dev`, parser) logged **zero exceptions and zero failed requests in the last 72h**. No plaintext
secrets remain — every secret is a Key Vault reference. The **only active error is Box auth** (owned by
*box-activator*, task #3) and it is closer to resolved than the brief implied. Remaining issues are operational
(PAYG deadline), hardening (httpsOnly, public PG), and doc drift.

---

## Method / evidence base
- `az functionapp list/show`, `az monitor app-insights query` (classic components — see note), `az keyvault …`,
  `az role assignment list`, `az postgres flexible-server show`, `mcp__azure__postgres`, `mcp__azure__resourcehealth`.
- **Telemetry topology (verified, corrects a doc simplification):** the 5 App Insights *components* are all
  **classic** (no Log Analytics workspace link), so they are queried via `az monitor app-insights query --app <appId>`,
  **not** `mcp__azure__monitor` (which targets Log Analytics). Routing:
  - `cespk-api-dev` → own component (ikey `678f34ec…`)
  - `cespk-orch-dev` → own component (ikey `c17806 17…`)
  - parser, **box**, enrich, eva, eval → **shared** `cespike-parser-ai-dev` (ikey `a980723d…`)
  - ocr → `cespkocr-ai-dev` (ikey `8c25c4ba…`)

---

## P0 — system-down / data-loss
**None.** No live-down condition. The system is read-only + manual-case-create by design and is serving that
correctly; no P0 was found.

---

## P1 — active failure or hard deadline

### P1-1 · Box intake auth failing on every op — **owned by box-activator (#3)**; brief detail is STALE
- **What:** every Box operation fails. 72h on the shared AI: `requests` show `502 | list_folder | cespkbox-fn-v76a47`
  (≈21 calls, clustered 19:50–20:05 on 2026-06-28); `traces` show repeated `box op auth failed: BoxAuthError`.
- **Evidence:**
  ```
  requests | resultCode 502, name list_folder, role cespkbox-fn-v76a47   (1 @19:50 bin, 20 @20:00 bin)
  traces   | "box op auth failed: BoxAuthError"  x many, last 2026-06-28T20:02:21Z
  ```
- **Cross-reference correction (important):** the brief says *"BOX_CONFIG_JSON missing."* **It is NOT missing.**
  - `cespkboxkvv76a47` contains all four secrets: `box-config-json`, `box-client-secret`, `box-webhook-primary-key`,
    `box-webhook-secondary-key`.
  - `box-config-json` is a **real 2347-char value**, `enabled=true`, **created/updated 2026-06-28T20:00:33Z**
    (single version).
  - box-fn's system-assigned MI (`5db514c8-…`) **already holds `Key Vault Secrets User`** on the vault
    (vault is RBAC-mode, 0 access policies — so the role assignment is the right mechanism and it is present).
- **Likely root cause:** the secret landed at **20:00:33**, i.e. *in the middle* of the error window, and box-fn's
  app-settings reference it with a **versionless** `SecretUri`. Azure Functions **caches Key Vault references**
  (refreshed on app restart / periodically, up to ~24h). So box-fn is still serving the pre-existing empty/placeholder
  cached value → `BoxAuthError`. This matches Microsoft's documented KV-reference caching behaviour (see
  `docs/azure/secrets-keyvault.md` and the route-guard reminder: *"after rotating a secret, pin a VERSIONED SecretUri
  or the old value stays cached"*).
- **Recommended fix (box-activator, NOT applied here):** **restart `cespkbox-fn-v76a47`** to force a KV-reference
  refresh; re-run a token-mint smoke test; then flip the `BOX_*` gates per `docs/azure/box-activation.md`. No further
  secret/RBAC work is needed — those are already in place. Consider pinning a versioned `SecretUri` to avoid re-caching.

### P1-2 · Free-Trial → Pay-As-You-Go hard deadline (operational availability risk)
- **What:** the subscription is **Azure Free-Trial** (`FreeTrial_2014-09-01`); the **whole stack disables at the
  ~30-day mark** unless upgraded to PAYG (documented in CURRENT_STATUS / CLAUDE.md). This is a hard availability cliff,
  not a soft gate. (I did not compute the exact days remaining — read-only sweep — operator should confirm.)
- **Owner/fix:** operator — upgrade to PAYG before the cliff (the 12-month free Postgres allowance survives the upgrade).

---

## P2 — hardening / drift / needs-verification

### P2-1 · `cespk-api-dev` + `cespk-orch-dev` have `httpsOnly=False`
- **Evidence:** `az functionapp list … httpsOnly` → api `False`, orch `False`; all 6 Python fns `True` (ocr `None`).
- **Impact:** the two primary live TS apps accept plain HTTP (downgrade risk). The SPA→API path should be HTTPS-only.
- **Owner/fix:** azure-integration-engineer / api-hardener — set `httpsOnly=true` on both.

### P2-2 · Postgres `publicNetworkAccess=Enabled`
- **Evidence:** `network.publicNetworkAccess=Enabled`; firewall has **only** `AllowAzureServices` (0.0.0.0–0.0.0.0).
- **Impact:** a public endpoint exists, but it is **mitigated** — no broad client/`0.0.0.0/0` rule; only Azure-internal
  services can reach it. Reasonable for now; private endpoint would be the hardening step.
- **Owner/fix:** azure-integration-engineer — track for private-endpoint / keep firewall tight.

### P2-3 · Function-count drift vs docs
- **Evidence:** **orch = 42** functions live (docs/diagnose.md say "healthy = 41"); **api = 44** (docs say 42).
  Full lists captured during the sweep. Both apps registered *more* than documented (not fewer — so not the
  "registered 0 functions" crash class; this is benign drift).
- **Owner/fix:** operator-scribe / docs — update `docs/architecture/live-environment.md` + `docs/azure/diagnose.md`
  baselines to 42 (orch) / 44 (api).

### P2-4 · Orchestration app emitted ZERO telemetry in 72h — cannot confirm timers are firing
- **Evidence:** on the `cespk-orch-dev` component: `requests`=0, `traces`=0, `customEvents`=0 over 72h
  (no `graph-renewal-success` / `graph-notification-received`).
- **Read:** consistent with "deployed + wired, NOT live" (no Graph subscriptions / no Exchange-RBAC scope), **but**
  the `graph-renew` / `case-disposition` / `box-blob-purge` **timer triggers** should still fire on schedule and log
  *something* (even "0 subscriptions"). Zero traces over 72h means we **cannot confirm the timers are executing**.
  Could be benign (long timer intervals / sampling) or a real gap (timers not running / AI not capturing from orch).
- **Owner/fix:** azure-diagnostician / azure-integration-engineer — confirm timer execution (one targeted run check,
  or temporarily lower sampling). Not urgent while intake is intentionally not live.

### P2-5 · Postgres AAD auth enabled but no AAD admin principal (informational)
- **Evidence:** `authConfig.activeDirectoryAuth=Enabled`, `passwordAuth=Enabled`, but `ad-admin list` is **empty**.
- **Impact:** the AAD auth path is effectively unusable as configured (no AAD admin mapped); the app correctly uses
  the password path (`cespk_app`, KV-ref'd `PGPASSWORD`). Low priority — either set an AAD admin or leave AAD off.

---

## Config sanity — clean (good news)
- **No plaintext secrets** in any Function App's app-settings. Every secret is a `@Microsoft.KeyVault(...)` reference:
  - api: `PGPASSWORD`
  - orch: `GRAPH_CLIENT_SECRET`, `PARSER_FN_KEY`, `ENRICH_FN_KEY`, `BOXWEBHOOK_FN_KEY`
  - box-fn: `BOX_CLIENT_SECRET`, `BOX_CONFIG_JSON`, `BOX_WEBHOOK_PRIMARY_KEY`, `BOX_WEBHOOK_SECONDARY_KEY`
  - enrich: `DVSA_CLIENT_ID/SECRET`, `DVSA_API_KEY`, `DVLA_API_KEY` · eva: `EVA_CLIENT_ID/SECRET`
  - Only non-secret plaintext seen: `APPLICATIONINSIGHTS_CONNECTION_STRING` (not a secret). Matches the 06-27 sweep.
- **No UNRESOLVED KV references found** by direct vault inspection (the box secrets all exist; box-fn MI has read RBAC).
  Note: the ARM `…/configreferences/appsettings` resolution-status endpoint returned `Not Found` here, so resolution was
  verified the direct way (secret existence + MI RBAC), not via the portal status API.

## Resource state
- **Function Apps:** all 8 `state=Running` (`cespkocr-fn-dev-glju3v` shows blank/`None` for some fields — formatting,
  not a stopped state; it is Running).
- **Postgres `cespk-pg-dev`:** `state=Ready`, v16, Burstable, 32 GB, HA disabled.
- **Transient (informational):** box-fn logged one `NoScriptHost` readiness blip at `2026-06-28T20:01:32Z` (host
  restart during the Box testing window) — benign, self-recovered.

---

## Limitations of this sweep (could not be verified read-only this session)
1. **DB-internal RLS state not live-verified.** Connecting to `cespk-pg-dev` (51.142.242.153:5432) from this host
   **fails** — the firewall allows only Azure services (no client-IP rule) and there is no AAD admin, and
   `mcp__azure__postgres` blocks system-catalog queries (`pg_roles` not allowed). Verifying `cespk_app`
   (`rolsuper=false` / `rolbypassrls=false`), the per-connection `app.role`, the 36-table count, and `case_=0`
   would require **opening the firewall or extracting `PGPASSWORD`** — both excluded by the read-only scope.
   The documented 2026-06-26 RLS resolution therefore **stands but is unverified live this session**. Recommend the
   env-bootstrap teammate (which may already have DB connectivity) or the operator confirm.
2. **Azure Resource Health detectors unavailable.** `Microsoft.ResourceHealth` is **not registered** on this
   subscription (409 Conflict). Health was assessed from control-plane state + the App Insights error scan instead.

---

## Overall verdict — **is the live stack healthy?**
**Yes, for what it is meant to be doing today.** The core path (SPA → Data API → Postgres, plus the parser) is
**clean**: zero exceptions and zero failed requests across `cespk-api-dev`, `cespk-orch-dev`, and the parser in the
last 72h; all apps Running; Postgres Ready; no plaintext secrets. `cespk-api-dev` shows **0 requests in 72h** — that is
*idle*, not broken (read-only system, nobody hit the SPA), so "no errors" reflects low traffic, not a silent failure.

The active defect is **Box auth (P1-1)**, which is **owned by box-activator** and is one `cespkbox-fn` **restart** away
from working — the secret and RBAC are already in place (the brief's "missing" is stale). The dominant *risks* are
operational, not code: the **PAYG deadline (P1-2)** and the **intentionally-not-yet-live email intake**. The P2 items
(httpsOnly off on the two live apps, public PG endpoint, doc drift, orch telemetry silence) are real but
non-blocking. Nothing here warrants halting other workstreams.
