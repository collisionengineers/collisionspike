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

## Binding reviews outrank everything older
`docs/reviews/<DDMMYY>/` holds **manual user reviews** — the **authoritative requirements** for the
areas they cover. A review **corrects drift and sets the spec**, and is **superseded only by a later
review**; it outranks older docs, plans, ADRs, and existing code. Action one by viewing every image,
turning each `review.md` step into a tracked to-do, implementing it, and filling
`checklist.md`'s "Changes made and actions taken". Honesty over green ticks — record gated/not-yet-live
items plainly. Convention + method: [docs/reviews/README.md](./docs/reviews/README.md).

## HARD RULE — no engineering language in the app UI
The Code App is used by **non-technical case handlers**. **Never** let implementation, cloud, process,
or meta/spec language reach a **user-facing string** (label, heading, eyebrow, subtitle, caption, hint,
placeholder, button, MessageBar/Toast title+body, tooltip, empty state, validation message, badge,
dropdown option). Write from the user's side, in plain **sentence-case active voice**: name things by
what the handler controls and recognises, and say **what they do**, never **how the system works**.

**Banned in rendered strings** (the principle governs, not just this list): Azure, Azure Maps, Blob /
storage, postcodes.io, DVLA, DVSA, Dataverse, connector, Function, SDK, Power Automate, flow, Key Vault,
OCR, Document Intelligence, API, endpoint, webhook, CSP, **JSON** (say "file" / "export"), **operator /
operator-gated / gated**, deploy, provisioned, mock, **seed / seeded**, schema, payload, "12-field",
**provenance** (→ "source"), **ADR / ADR-00xx**, **M1 / M2 / M3 / milestone**, EVA field numbers,
"correlation key", **brief/spec phrasing** ("derived from what the case holds", "for reference",
"read-only in M1", "not wired up"), and internal system names (**Box → "Archive"**).
**Keep** the real domain words handlers use: EVA, VRM / registration, Case/PO, Principal, work provider,
claimant, insured, inspection, instruction, chaser, photo / image, evidence, queue.

Gated / not-yet-live features say so **in plain user terms** ("Vehicle lookup isn't available yet."),
never via "operator-gated" / "connector" / env-var names. Code **comments** may use engineering terms
freely — this rule is about **rendered strings only**. When you delegate UI work to an agent, pass this
rule in the brief. (Origin: review 190626 R2 — brief/spec text was leaking onto the screen, e.g.
"Automatic — derived from what the case holds", "operator-gated Blob-connector step".)

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
7. **The CE Parser connector re-encodes the base64 `document` a SECOND time** (a `format:byte`-class
   gateway behaviour). Keep `ParseRequest.document` a plain `{type: string}` — **NEVER** add `format:
   byte` / `x-ms-media-kind: File` (that guarantees the double-encode and broke live intake once);
   pass the **RAW base64 string** `@triggerBody()?['instructionBytesB64']` from `CS Parse` — **NEVER
   `@base64ToBinary(...)`**: with the plain-string connector that feeds the gateway BINARY and it
   returns **400** (proven 2026-06-20: `test34` → 400 → Exceptions; the SAME doc posts 200 directly to
   `/api/parse`). Keep `function_app._decode_document` **tolerant** (peels a redundant 2nd layer, logs
   each recovery) — it is the load-bearing fix because the gateway encoding **DRIFTS** with connector
   state. A flow `parser failed: 400` / `422` while a **direct** `POST /api/parse` 200s = the gateway
   encoding, not the parser. See memory `powerplatform-connector-base64-double-encode`.

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

## Stack-specific tooling (use these, don't reinvent)
Agents **should actively reach for these** before training knowledge or web search. Detailed runtime
gotchas live in [docs/architecture/live-environment.md](./docs/architecture/live-environment.md) and the
memory files; this is the tool index.

| Group | What to reach for | Rule |
| --- | --- | --- |
| **Microsoft Learn MCP** (`mslearn`) — gold-standard source of truth | `microsoft_docs_search` (breadth), `microsoft_code_sample_search` (official samples), `microsoft_docs_fetch` (full-page depth); skills `/microsoft-docs:microsoft-docs`, `microsoft-code-reference`, `microsoft-skill-creator` | **Consult FIRST** for any Power Platform / Power Automate / Dataverse / Azure / Power Apps question. Confirmed working in this env. Run `/microsoft-docs:microsoft-skill-creator` to capture a **hard problem you eventually solved** as a reusable skill. |
| **Azure CLI + Azure MCP + `azure-*` skills** — all Azure work (Functions, Container Apps, Key Vault, storage, Monitor/App Insights, RBAC, deploy) | Azure MCP routers (`functionapp`/`functions`, `monitor`, `storage`, `keyvault`, `role`, `deploy`, `containerapps`, `bestpractices`…); `extension` tools generate/run `az`/`azd`/`func`/`azqr`; skills `azure-deploy`, `azure-functions`, `azure-storage`, `azure-rbac`, `entra-app-registration` | Prefer the MCP `extension` tools to generate commands; call **`bestpractices` before generating Azure code or deploying**. **Use PowerShell, not Git Bash**, for `az` with URL/resource-id args (MSYS mangles leading-slash args). `az role assignment` returns `MissingSubscription` here — grant roles via **ARM-template**, not the CLI. |
| **Power Platform CLI `pac` + `code-apps-preview:*` skills** — drives the Code App | `pac code init`/`add-data-source`/`run`/`push`; skills `create-code-app`, `add-dataverse`, `add-sharepoint`, `add-office365`, `add-connector`, `deploy`, `list-connections` | **`code-app-architect` owns** the Code App shell + `pac code` deploy. **Build before push** (`npm run build`) and **hard-refresh** (player caches). `pac` still labels `code` **"(Preview)"** — confirm GA/licensing before production. |
| **Chrome DevTools MCP + Vite/npm** — debug the deployed Code App in-browser | `chrome-devtools` MCP (navigate, snapshot, console, network, performance, lighthouse); skills `chrome-devtools`, `a11y-debugging`, `debug-optimize-lcp`, `troubleshooting`. (`model-apps` Playwright MCP is an alt browser path.) | Inspect the **live player** (console errors, failed network calls) when the app misbehaves. A blocked request in the network panel usually = the **CSP rule** (`connect-src 'none'`) — external calls must go through a **connector**, not raw `fetch`. There is **no "React CLI"**: the React app is built/served via **Vite/npm** and shipped with `pac code push`. |

**Other tools worth using**
- **context7 MCP** — live library/SDK docs (React, Vite, Fluent UI, Power Platform SDKs); use for non-Microsoft library APIs where Learn MCP is thin.
- **Project skills** — `/power-automate-flow` (copy-paste flow-definition JSON + @-expressions), `/eva-sentry-api` (Sentry v1.2 + 12-field contract), `/collision-engineers-design` (CE brand for any UI/asset), `/grill-with-docs` (stress-test a plan against the domain model before building).

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
