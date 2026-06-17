# Environment & Build Prerequisites

Discovered state (probed via `pac` / `az` / `infisical`, June 2026) and what M1 needs to start.

## Power Platform — ready
- Authenticated as `digital@collisionengineers.co.uk` (`pac`). M365 confirmed.
- Dataverse environment **"Collision Engineers (default)"** —
  `https://orgc6eb68d0.crm11.dynamics.com/`, env ID `858cf5b3-aa0a-47a6-9b40-4851fd0afa94`.
- **TODO:** verify the **code apps feature** is enabled on this environment (Admin center →
  Environments → Settings → Product → Features) and Power Apps **Premium** licensing.

## Azure — BLOCKER: no subscription
- `az` is authenticated (same user) but there is **no Azure subscription** — only a tenant-level
  account (`az account list` → `N/A(tenant level account)`).
- The M1 Azure Functions (parser wrapper — ADR-0004; DVSA wrapper — ADR-0006) and later Azure
  Document Intelligence / Foundry **require an Azure subscription**. Either provision one, or host
  the wrappers elsewhere (see the open decision).

## Secrets — Infisical
- Infisical CLI installed (winget) at
  `C:\Users\Alex\AppData\Local\Microsoft\WinGet\Links\infisical.exe` — **not on PATH** (add it or
  invoke by full path). Authenticated (per user). Source of truth for secrets: **EVA test
  `Client_Id`/`Secret`**, the `collisionplugin` gateway OAuth client creds, etc.

## EVA — test creds available
- EVA **test** credentials available (via Infisical). Same base URL; test creds route to the test
  server (ADR-0005).

## Open decision — where do the REST wrappers run?
The parser + DVSA/valuation wrappers were specced as **Azure Functions** (ADR-0004/0006), but there
is **no Azure subscription**. The wrappers are just REST endpoints (Power Platform reaches them via a
custom connector regardless of host). Options:
1. **Provision an Azure subscription** and keep Azure Functions — most aligned with the MS-stack spike.
2. **Host on Google Cloud Run** alongside the existing `collisionplugin` connectors — no new cloud
   account, reuses existing CE infra + gateway creds; least friction to unblock M1.
3. **Defer** — M1 uses the parser CLI / JSON import until a host exists.

Recommendation: **(2) Cloud Run for M1** to unblock without provisioning Azure; provision Azure later
when Azure Document Intelligence / Foundry are actually needed (M2+).
