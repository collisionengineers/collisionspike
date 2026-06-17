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

## How the app actually runs (runtime model)
- A **Code App is a browser-hosted SPA**: `pac code push` publishes the compiled app to a
  **publicly accessible Power Platform endpoint**; end-users play it at `apps.powerapps.com/play/…`
  in the **browser**, authenticated via Entra. At runtime it can **only reach data through Power
  Platform connectors** — it **cannot invoke a local CLI/process**. (`npm run dev` runs on localhost,
  but that's development only; since Dec 2025 browsers block public→local calls by default.)
  Sources: <https://learn.microsoft.com/power-apps/developer/code-apps/architecture> ·
  <https://learn.microsoft.com/power-apps/developer/code-apps/system-limits-configuration>
- **Automation also runs server-side:** Power Automate **cloud flows** are Microsoft-hosted
  (connectors/HTTP only — no local process). But two native patterns let the **parser run locally as
  part of the automation** (no human in the loop):
  - **On-premises data gateway** — a cloud flow / custom connector reaches a **local HTTP service**
    (the parser) on a CE machine; outbound-only, secure via Azure Service Bus relay.
    <https://learn.microsoft.com/power-platform/admin/wp-onpremises-gateway>
  - **Power Automate Desktop (RPA)** — a cloud flow triggers a desktop flow that **runs the parser
    CLI** (the "Run DOS command / console application" action) on a local/VM machine (attended or
    unattended bot). <https://learn.microsoft.com/power-automate/desktop-flows/actions-reference/scripting#run-dos-command>

## Open decision — where does the parser run?
The parser is **part of the automation** (no human needed), so it need not be a cloud service.
Options:
1. **Local, bridged to Power Platform** — run the parser locally (HTTP service via the **on-prem data
   gateway**, or CLI via **Power Automate Desktop**) on an always-on CE machine/VM. No cloud account;
   reuses the local Python/Tesseract. **Needs a machine that stays on** (+ RPA capacity if unattended).
2. **Google Cloud Run** — host alongside the existing `collisionplugin` connectors; no Azure account.
3. **Azure Functions** — as ADR-0004/0006, but **needs an Azure subscription** (none today).
4. **Defer** — CLI/import until a host exists.

DVSA/valuation already run remotely (collisionplugin Cloud Run behind the gateway) — they need only a
custom connector, not new hosting.

Recommendation: **(1) local-via-gateway/PAD if an always-on machine exists** (matches the "parsing is
just automation" intuition, zero cloud spend); otherwise **(2) Cloud Run**. Provision Azure only when
Document Intelligence / Foundry are needed (M2+). This revises ADR-0004's "Azure Function" host.
