# AGENTS.md — operational charter for `collisionspike`

Complements [CLAUDE.md](./CLAUDE.md) (which covers what the repo *is* and the domain model). This file
captures **how to work safely against the live cloud** and the **hard-won runtime truths** that have
repeatedly bitten this project. Read it before touching the Code App, the flows, or the Functions.

## Environment (never guess)
> Full ID/resource/flow/connection registry (verified live): [docs/architecture/live-environment.md](./docs/architecture/live-environment.md).
- **Work env:** `Collision Engineers - Dev` (sandbox) — id `b3090c42-51fb-ee24-9868-474da322a3ad`,
  url `https://collisionengineers-dev.crm11.dynamics.com`. **Never** use the **Default** env
  (`858cf5b3-…`).
- Azure: resource group `rg-collisionspike-dev` (UK South). Functions `cespike-parser-dev-x7xt3d5ovhi7y`
  (parser) and `cespkenrich-fn-gi62sd` (enrichment). Signed-in identity / intake mailbox:
  `digital@collisionengineers.co.uk`.
- Code App id `da7ba7af-9ffc-4c70-8f75-1f053ca354da`; play URL under `apps.powerapps.com/play/e/<env>/app/<id>`.

## Runtime truths (do not relearn the hard way)
1. **Code Apps enforce CSP `connect-src 'none'` by default.** A Code App must reach external services
   through a **Power Platform connector** (called via the `@microsoft/power-apps` SDK), **never** a raw
   `fetch()`/XHR to an arbitrary host (e.g. `*.azurewebsites.net`). A raw call fails with an instant
   "Failed to fetch" on the deployed player but *works on localhost* (no CSP) — a classic false "it
   works". See memory `codeapp-csp-use-connectors`.
2. **Connection-webhook flow triggers (Office 365 email, etc.) are NOT armed by the Dataverse
   `clientdata` API or statecode toggles, nor by a Flow-API stop/start, nor by a plain designer Save of
   a corrupt node.** They must be (re)published through the **make.powerautomate.com designer** with a
   **fresh trigger node**: delete the trigger, re-add it, Save. If the old trigger had concurrency
   control you must re-enable **Concurrency = 1** or the save fails `CannotDisableTriggerConcurrency`.
   See memory `flow-webhook-trigger-provisioning`.
3. **Email trigger choice:** `When a new email arrives (V3)` monitors the **connected account's own
   mailbox**. `…shared mailbox (V2)` needs a **real shared mailbox** (no sign-in) — do not point it at
   a normal user mailbox like `digital@`.
4. **Azure Functions CORS is a *platform* setting** (`az functionapp cors`), not `host.json`. Don't
   diagnose deployed-app fetch failures as "missing host.json CORS".
5. **Build before push, then hard-refresh.** `npm run build` → `pac code push` deploys `dist/`. The
   player caches aggressively — a stale logo/parse is usually an old cached build; **Ctrl+Shift+R**.
6. **No mock/seed case data in the app, ever.** It renders real Dataverse rows only.

## Verify against reality — don't trust source or summaries
Prior sessions shipped confident, wrong diagnoses. Always confirm live:
- **Dataverse Web API:** `az account get-access-token --resource <org>/` →
  `GET <org>/api/data/v9.2/workflows?$filter=category eq 5&$select=name,statecode` (flow on/off),
  `…/cr1bd_cases` (rows).
- **Flow Management API** (`--resource https://service.flow.microsoft.com/`):
  `…/environments/<env>/flows/<id>/runs` and `/triggers` + `/triggers/<t>/histories` (a healthy webhook
  trigger returns 200; **500 = unprovisioned subscription**).
- **Azure CLI:** `az functionapp cors show`; `curl.exe -X OPTIONS … -H "Origin: https://apps.powerapps.com"`
  to prove preflight/CORS.
- **Chrome DevTools MCP:** load the deployed app, read console + network (asset 200/404, CSP violations).
- **Microsoft Learn MCP** for authoritative contracts before acting.

## Agent roster & boundaries (project agents in `.claude/agents/`)
- **azure-integration-engineer** — Functions (parser + enrichment REST wrappers), Key Vault, Entra,
  custom connectors, Document Intelligence, postcode.io/Azure Maps.
- **power-automate-flow-builder** — cloud flows (intake, dedup, status machine, parser/enrichment calls,
  EVA+Box finalize, chasers).
- **eva-sentry-integration** — EVA Sentry REST v1.2, the 12-field JSON contract, photo-order/image rules.
- **dataverse-data-architect** — the `CollisionSpike` solution: tables, relationships, provenance,
  env-var gates, auditing, ALM.
- **document-parser-engineer** — completes/integrates `cedocumentmapper_v2` (PyMuPDF is **licensed** —
  never re-raise AGPL).
- Reuse **code-app-architect** (code-apps-preview) for the Code App shell / `pac code` deploy. Do **not**
  use `canvas-app-*` or `genpage-*` agents — this is a **Code App**.

## Recommended guardrail hooks (see `.claude/settings.json`)
- PreToolUse on `pac code push` → remind to `npm run build` first + hard-refresh.
- PostToolUse on edits to `mockup-app/src/**` introducing `fetch(`/`azurewebsites.net` → remind to use a
  connector (CSP rule above).
