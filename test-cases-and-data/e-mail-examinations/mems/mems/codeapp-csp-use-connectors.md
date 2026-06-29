---
name: codeapp-csp-use-connectors
description: "Power Apps Code Apps enforce CSP connect-src 'none' by default — never raw-fetch external hosts from the Code App; call them through a Power Platform custom connector via the SDK."
metadata: 
  node_type: memory
  type: reference
  originSessionId: 5e5bd268-e0d6-4dfb-9c9c-c735a3b9d76e
---

The collisionspike Code App's manual-intake **"parse"** fails on the **deployed** app (the `apps.powerapps.com` player, served in an iframe from `*.powerplatformusercontent.com`) with an instant **"Failed to fetch"**, because Power Apps **Code Apps enforce a default CSP of `connect-src 'none'`** (Microsoft Learn: *code-apps → how-to → content-security-policy*). That blocks the app's raw cross-origin `fetch()` to the parser Azure Function (`cespike-parser-dev-…azurewebsites.net`).

The Function itself is **healthy** — verified with `curl`: preflight `OPTIONS` → **204** with `Access-Control-Allow-Origin: https://apps.powerapps.com` and `…-Allow-Headers: content-type,x-functions-key`; real `POST` → 400 (empty doc) **with** the ACAO header. Platform CORS already allows `https://apps.powerapps.com`. So CORS/the Function were never the problem — the prior "missing host.json CORS" theory was wrong (Azure Functions CORS is a *platform* setting, not host.json). Manual intake only ever "worked" on **localhost** (no CSP).

**Fix:** route the parser through the existing **CE Parser custom connector** (`pac code add-data-source`) and call it via the Power Apps SDK — same-origin through the platform, so it is **not** subject to `connect-src`, and the function key lives in the **connection**, not the client bundle. (Alternative: whitelist the Function host in the env CSP `connect-src` via PPAC — keeps the embedded key and the fragile direct call; not preferred.) General rule: **a Code App talks to Dataverse and to external services through connectors, never a bare `fetch()` to an arbitrary host.** Pairs with [[flow-webhook-trigger-provisioning]].
