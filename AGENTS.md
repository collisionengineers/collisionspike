# AGENTS.md — operational charter for `collisionspike`

Complements [CLAUDE.md](./CLAUDE.md) (which covers what the repo *is* and the domain model). This file
captures **how to work safely against the live cloud** and the **hard-won runtime truths** that have
repeatedly bitten this project.

> ## LIVE STACK = Azure PaaS (Power Platform DEPROVISIONED 2026-06-27) — read this first
> **Verified live 2026-06-27.** The running system is the **Azure PaaS stack**; the migration off Power
> Platform has been **built + deployed** (the Azure stack is the live system), and the **Power Platform
> footprint was deprovisioned 2026-06-27** (the Dev sandbox + both solutions + Code App + connectors + the
> remaining `case-resolve` flow deleted via `pac admin delete`).
> **Do not** treat the Power Platform implementation (Power Apps **Code App**, **Dataverse**, the ~16
> **Power Automate** flows, the **custom connectors**) as live — it is the **prior era**, retained below as
> **historical reference** and clearly banded as such. The **business domain is unchanged** — EVA 12-field contract, image rules, photo order, provider
> corpus, Case/PO format, inspection-address corpus — **only the platform mechanism changed**.
>
> **The live Azure tier (in `rg-collisionspike-dev`, UK South, subscription `e6076573-…`):**
> - **SPA** — Static Web App **`cespk-spa-dev`** (West Europe), React/Vite built from `mockup-app/`, with
>   **MSAL / Entra workforce sign-in** (staff-only). It calls the Data API over **plain REST**
>   (`mockup-app/src/data/rest-client.ts`) — **no Power SDK, no connectors**.
> - **Data API** — Function App **`cespk-api-dev`** (Node 20 / TypeScript Functions v4, source `api/`).
>   Validates the **Entra JWT** (`jose`) and enforces app roles **`CollisionSpike.User` /
>   `CollisionSpike.Superuser`** (Superuser is the full-privilege role formerly named `CollisionSpike.Admin`,
>   whose legacy name `auth.ts` still accepts; a `CollisionSpike.Engineer` role is defined but not yet
>   enforced). Connects to Postgres.
> - **Orchestration** — Function App **`cespk-orch-dev`** (source `orchestration/`) — email intake is
>   **LIVE** on the production mailbox set: **Microsoft Graph PUSH change-notification subscriptions** over
>   **info@ + engineers@ + desk@** (all Exchange-RBAC-scoped; no Global-Admin consent; the 2026-06-29 mailbox
>   cutover added info@ + desk@ and removed the test/dev mailbox digital@). Transport is **PUSH, not
>   delta-poll.** Manual case-create remains alongside. ✅ Subscription renewal is **durable** (the eternal
>   `subscriptionMonitorOrchestrator` wakes the scale-to-zero app) — operator watch-item = confirm an
>   unattended renew at the next wake. Subscription counts + RBAC state: the live registry
>   [docs/architecture/live-environment.md](./docs/architecture/live-environment.md).
> - **System-of-record DB** — Postgres Flexible **`cespk-pg-dev`** (v16), database `collisionspike`.
> - **Retained from before, unchanged:** the **6 Python Functions** (parser `cespike-parser-dev`,
>   enrichment, evasentry, evavalidation, ocr, box-webhook), the **Key Vaults**, Blob
>   `cespkevidstdev01`, App Insights / Log Analytics.
>
> **Honest live gaps (state them, don't paper over):** (1) email intake is **live** on the production
> mailbox set (orch runs Graph PUSH subscriptions over info@ + engineers@ + desk@, all Exchange-RBAC-scoped;
> the 2026-06-29 cutover removed the test/dev mailbox digital@); subscription renewal is durable
> (`subscriptionMonitorOrchestrator`) — confirming an unattended renew + adding a subscription-prune step are
> the live watch-items;
> (2) the **DB-credential / RLS P0 is resolved (2026-06-26)** — the API connects as the non-owner Postgres
> login **`cespk_app`** (Key Vault-referenced password; **RLS enforced**), not `csadmin`; **the other
> plaintext secret exposures (Graph client secret, storage keys, Document Intelligence key, function keys)
> were also remediated 2026-06-27** — all to Key Vault references / identity-based / keyless auth; (3) the whole stack sits on an **Azure Free Trial** and
> is **disabled at ~30 days** unless upgraded to Pay-As-You-Go; (4) staff **app-role assignment is
> incomplete** (one principal assigned; others 403 until assigned); (5) durable auth error-handling +
> audience-form hardening still in progress. Full live registry:
> [docs/architecture/live-environment.md](./docs/architecture/live-environment.md).

Read it before touching the SPA, the API, or the Functions. (Sections below that describe the **Code App**,
**Dataverse**, **flows**, and **connectors** are **historical** unless they state a domain rule.)

## Environment (never guess)
> Full ID/resource/flow/connection registry (verified live): [docs/architecture/live-environment.md](./docs/architecture/live-environment.md).
> The **live** environment is the Azure tier in the banner above (RG `rg-collisionspike-dev`, UK South).
> The Azure resources below remain accurate; the **Dataverse / Code App** rows are **HISTORICAL** (the
> Power Platform era — superseded by the Azure stack; **deprovisioned 2026-06-27**, kept for reference).
- Azure: resource group `rg-collisionspike-dev` (UK South), subscription `e6076573-23a5-46a8-acef-7e22d264e5db`
  (**Azure Free Trial** — disabled at ~30 days unless upgraded to PAYG). Live Function Apps `cespk-api-dev`
  (Data API), `cespk-orch-dev` (orchestration, **email intake live** — Graph PUSH subs over the production mailboxes info@ + engineers@ + desk@); Postgres `cespk-pg-dev`; SWA
  `cespk-spa-dev`. Retained Python Functions `cespike-parser-dev` (parser), `cespkenrich-fn-gi62sd`
  (enrichment), and `cespkbox-fn-v76a47` (box-webhook — **Box is now LIVE** (JWT Server Auth, 2026-06-28):
  `BOX_API_ENABLED`/`BOX_FOLDER_AT_INTAKE_ENABLED`/`BOX_FILEREQUEST_ENABLED`=true on api + orch,
  `BOX_FOLDER_ROOT_ID=392761581105`; gate states in the [registry](./docs/architecture/live-environment.md)).
- **[HISTORICAL — deprovisioned 2026-06-27]** Power Platform work env: `Collision Engineers - Dev` (sandbox — **deleted via `pac admin delete`**), id
  `b3090c42-51fb-ee24-9868-474da322a3ad`, url `https://collisionengineers-dev.crm11.dynamics.com`
  (**Default** env `858cf5b3-…` was always off-limits). Code App id
  `da7ba7af-9ffc-4c70-8f75-1f053ca354da` (play URL under `apps.powerapps.com/play/e/<env>/app/<id>`).
  Intake mailbox `digital@collisionengineers.co.uk`.

## Binding reviews outrank everything older
`docs/reviews/<DDMMYY>/` holds **manual user reviews** — the **authoritative requirements** for the
areas they cover. A review **corrects drift and sets the spec**, and is **superseded only by a later
review**; it outranks older docs, plans, ADRs, and existing code. Action one by viewing every image,
turning each `review.md` step into a tracked to-do, implementing it, and filling
`checklist.md`'s "Changes made and actions taken". Honesty over green ticks — record gated/not-yet-live
items plainly. Convention + method: [docs/reviews/README.md](./docs/reviews/README.md).

## HARD RULE — no engineering language in the app UI
The live app (the **SPA**, formerly the Code App) is used by **non-technical case handlers**. This rule is
platform-agnostic and **still binding** — the new stack adds more banned terms (Azure, Postgres, MSAL,
Entra, JWT, Function App, SWA), and the old ones (Dataverse, Power Automate, flow, connector, Key Vault)
stay banned. **Never** let implementation, cloud, process,
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
> **Banding (2026-06-26).** Items **1–5 and 7** are **HISTORICAL Power-Platform mechanics** (Code App CSP /
> connectors, flow-trigger provisioning, the parser-connector base64 double-encode) — they bit the
> **superseded** Power Platform stack and no longer apply to the live Azure tier (the SPA calls the API over plain
> REST; the parser Function is posted by the orchestration tier, not via a connector gateway). They are
> kept verbatim as the historical record. Items **6 (no mock/seed data)** and **8 (`Loc` is an EVA-export
> artifact)** are **domain invariants that remain LIVE** and bind the Azure stack unchanged. On the live
> stack, the CSP analogue is **CORS on `cespk-api-dev` + the SWA origin**, and the base64 tolerance still
> lives in the retained parser Function.
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
8. **`Loc` is an EVA-export artifact, not an intake input.** The inspection address is an
   **offline-derived full-address suggestion** (a static, full-addresses-only corpus in
   `cr1bd_inspectionaddress`) that staff **pick/edit manually**, falling back to "Image Based
   Assessment" with a reason — **there is NO runtime address matcher** (the one that misread `Loc` was
   removed root-and-stem 2026-06-23). Do not re-derive a partial postcode at runtime; there is no
   `cr1bd_loc` Case column. See ADR-0013 / `docs/architecture/inspection-address-corpus.md`.

## Verify against reality — don't trust source or summaries
Prior sessions shipped confident, wrong diagnoses. Always confirm live:
- **Live Azure tier:** `az functionapp show`/`az functionapp function list` on `cespk-api-dev` /
  `cespk-orch-dev` (live function counts in the [registry](./docs/architecture/live-environment.md) — email
  intake is **live** via Graph PUSH subscriptions over the production mailboxes info@ + engineers@ + desk@);
  `az staticwebapp show` on `cespk-spa-dev`; query Postgres `cespk-pg-dev` (db `collisionspike`) for row
  state. Token/role checks: decode the Entra JWT and confirm `aud` = the API client-id GUID + the `roles`
  claim (`CollisionSpike.User` / `.Admin`).
- **Azure CLI / CORS:** `az functionapp cors show` on `cespk-api-dev`;
  `curl.exe -X OPTIONS … -H "Origin: https://proud-sky-04e318b03.7.azurestaticapps.net"` to prove the
  SPA→API preflight.
- **Chrome DevTools MCP:** load the deployed SPA, read console + network (asset 200/404, 401/403 from the
  API, CORS).
- **Microsoft Learn MCP** for authoritative contracts before acting.
- **[HISTORICAL — Power Platform, deprovisioned 2026-06-27]** `Dataverse Web API` (`…/api/data/v9.2/workflows?$filter=category eq 5`
  for flow on/off; `…/cr1bd_cases` for rows) and the **Flow Management API**
  (`…/environments/<env>/flows/<id>/runs|triggers`) were the old verification surfaces — no longer the live path.

## Stack-specific tooling (use these, don't reinvent)
Agents **should actively reach for these** before training knowledge or web search. Detailed runtime
gotchas live in [docs/architecture/live-environment.md](./docs/architecture/live-environment.md) and the
memory files; this is the tool index.

**Azure task routing.** For any Azure op, match the task → skill/tool/agent in
**[docs/azure/README.md](./docs/azure/README.md)** (per-task playbooks) and **invoke the named skill
first** — don't hand-roll `az`/`func`/`psql`/KQL in a loop. Two guard hooks enforce it (see
*Recommended guardrail hooks* below). Read-only live triage → the **azure-diagnostician** agent;
build/deploy/wire → **azure-integration-engineer**.

| Group | What to reach for | Rule |
| --- | --- | --- |
| **Microsoft Learn MCP** (`mslearn`) — gold-standard source of truth | `microsoft_docs_search` (breadth), `microsoft_code_sample_search` (official samples), `microsoft_docs_fetch` (full-page depth); skills `/microsoft-docs:microsoft-docs`, `microsoft-code-reference`, `microsoft-skill-creator` | **Consult FIRST** for any Power Platform / Power Automate / Dataverse / Azure / Power Apps question. Confirmed working in this env. Run `/microsoft-docs:microsoft-skill-creator` to capture a **hard problem you eventually solved** as a reusable skill. |
| **Azure CLI + Azure MCP + `azure-*` skills** — all Azure work (Functions, Container Apps, Key Vault, storage, Monitor/App Insights, RBAC, deploy) | Azure MCP routers (`functionapp`/`functions`, `monitor`, `storage`, `keyvault`, `role`, `deploy`, `containerapps`, `bestpractices`…); `extension` tools generate/run `az`/`azd`/`func`/`azqr`; skills `azure-deploy`, `azure-functions`, `azure-storage`, `azure-rbac`, `entra-app-registration` | Prefer the MCP `extension` tools to generate commands; call **`bestpractices` before generating Azure code or deploying**. **Use PowerShell, not Git Bash**, for `az` with URL/resource-id args (MSYS mangles leading-slash args). `az role assignment` returns `MissingSubscription` here — grant roles via **ARM-template**, not the CLI. |
| **Vite/npm + SWA CLI/deploy** — build & ship the live SPA | `npm run build` (Vite) from `mockup-app/`; deploy the build to Static Web App `cespk-spa-dev`. **`code-app-architect` owns** the SPA shell. **Build before deploy** and **hard-refresh** (the SWA edge caches). The SPA calls the API over plain REST + MSAL — **no connectors**. | Live path. |
| **[HISTORICAL] Power Platform CLI `pac` + `code-apps-preview:*` skills** — drove the **retired** Code App | `pac code init`/`add-data-source`/`run`/`push`; skills `create-code-app`, `add-dataverse`, `add-office365`, `add-connector`, `deploy`, `list-connections` | **Reference only** — the Code App and its `pac code` deploy path are **no longer the live path (Power Platform deprovisioned 2026-06-27)**; do not deploy via `pac`. |
| **Chrome DevTools MCP + Vite/npm** — debug the deployed SPA in-browser | `chrome-devtools` MCP (navigate, snapshot, console, network, performance, lighthouse); skills `chrome-devtools`, `a11y-debugging`, `debug-optimize-lcp`, `troubleshooting`. (`model-apps` Playwright MCP is an alt browser path.) | Inspect the **live SPA** (console errors, failed network calls) when the app misbehaves. A blocked request usually = **CORS** on `cespk-api-dev` or a **401/403** from the API (missing token / unassigned app role) — not a connector. The React app is built/served via **Vite/npm** and shipped to the SWA. |

**Other tools worth using**
- **context7 MCP** — live library/SDK docs (React, Vite, Fluent UI, Power Platform SDKs); use for non-Microsoft library APIs where Learn MCP is thin.
- **Project skills** — `/power-automate-flow` (copy-paste flow-definition JSON + @-expressions), `/eva-sentry-api` (Sentry v1.2 + 12-field contract), `/collision-engineers-design` (CE brand for any UI/asset), `/grill-with-docs` (stress-test a plan against the domain model before building).

## Agent roster & boundaries (project agents in `.claude/agents/`)
> **Live-stack mapping (2026-06-26).** The roster is kept intact, but the **platform** each agent targeted
> has changed. The live stack is **Azure**: the **Data API** (`api/`, Node/TS Functions v4 on
> `cespk-api-dev`), the **orchestration tier** (`orchestration/`, Durable-Functions / Graph **PUSH**
> change-notification intake on `cespk-orch-dev`, **email intake live in testing**), **Postgres** (`cespk-pg-dev`), and the
> **SPA/MSAL** front end on Static Web App `cespk-spa-dev`. Agents whose surface was Power Platform are
> **reference-only for the historical stack** (their **domain/contract** knowledge carries over to the new
> code; the **platform mechanics** do not). Tagged below.
> **Roster delta (2026-06-27):** added **azure-diagnostician** (read-only Azure triage). The
> **`dataverse-data-architect`**, **`document-parser-engineer`**, and **`fluent-codeapp-designer`** agent
> files were **deleted** — their domain guidance survives in the docs + the `cedocumentmapper_v2.0`
> sibling, but the agents are no longer dispatchable. **(2026-07-01:** the production-UI-builder role was
> **re-created as `fluent-spa-designer`** — it builds the **Azure SWA Fluent v9 SPA**, *not* a Power Apps
> Code App; older design-lab docs that say `fluent-codeapp-designer` mean this role.) All Azure work routes through
> **[docs/azure/](./docs/azure/README.md)**.
- **azure-integration-engineer** — *(live, expanded)* Azure Functions (parser + DVSA/DVLA enrichment
  **direct via Entra client_credentials**, no Google gateway; plus the box-webhook receiver), Key Vault,
  **Entra app registrations / MSAL / JWT validation**, Document Intelligence, postcode.io/Azure Maps —
  now also the home for the **`api/` Data API + `orchestration/` intake** and the **Postgres** wiring.
  Routes through the **[docs/azure/](./docs/azure/README.md)** playbooks + the `azure:*` skills.
- **azure-diagnostician** — *(live, new)* **read-only** root-cause triage of live Azure issues: pulls App
  Insights/KQL (`cespike-parser-ai-dev`), AppLens/resource-health, function lists, and RLS/secret state,
  cross-checks Microsoft Learn, and returns a **root-cause + recommended fix**. Dispatch it for "why is X
  failing" so the main loop stops thrashing; it **applies nothing** — fixes go to azure-integration-engineer.
- **power-automate-flow-builder** — **[HISTORICAL / reference-only]** authored the Power Automate cloud
  flows (intake, dedup, status machine, parser/enrichment calls, EVA+Box finalize, chasers). The flows were
  **deprovisioned 2026-06-27 with the rest of the Power Platform footprint**; their **logic** (dedup ladder ADR-0010, the status machine, chaser policy) was
  **re-implemented in the `api/` + `orchestration/` TypeScript Functions** — consult this agent for the
  contract, not for deploying a flow.
- **eva-sentry-integration** — *(live, unchanged domain)* EVA Sentry REST v1.2, the 12-field JSON
  contract, photo-order/image rules — platform-agnostic, fully carried over.
- **dataverse-data-architect** — **[HISTORICAL / reference-only]** owned the `CollisionSpike` Dataverse
  solution (tables, relationships, provenance, env-var gates, auditing, ALM). Dataverse is
  **superseded by Postgres (Power Platform deprovisioned 2026-06-27)**; the **data model + invariants** (provenance, append-only audit, archive-not-delete
  corpus, default-deny) moved to **Postgres `cespk-pg-dev`** (`migration/assets/schema/`) — consult this
  agent for the model, not for Dataverse metadata.
- **document-parser-engineer** — *(live, unchanged)* completes/integrates `cedocumentmapper_v2` (PyMuPDF
  is **licensed** — never re-raise AGPL); the vendored engine still runs in the **retained parser
  Function**.
- Reuse **code-app-architect** (code-apps-preview) for the **SPA shell** (React/Vite + MSAL + the
  `mockup-app/` component library). **[HISTORICAL]** its `pac code` deploy path is **no longer the live path (Power Platform deprovisioned 2026-06-27)** — the SPA
  now ships to Static Web App `cespk-spa-dev`. Do **not** use `canvas-app-*` or `genpage-*` agents.

### UI/UX design-lab agents (`docs/plans/phase-ux-design-lab/`)
Explore many **throwaway HTML/React** UI directions, judge them, converge, then **port the winner to the
Fluent v9 Code App**. Each owns one slice and **defers the Code App shell / routes / connector wiring /
`pac code` deploy to code-app-architect**; none use `canvas-app-*` / `genpage-*` / `mcp-apps:*`.
- **ux-architect** — information architecture, navigation, the main-page **inbox cockpit** (whole inbox:
  receiving_work/query/other + new cases + data) + the retained queues, user flows, and the **evaluation
  rubric** (the shared brief every direction builds against).
- **ui-ux-pro-max-specialist** — the variety engine: drives `ui-ux-pro-max` to seed one *distinct* design
  system per direction.
- **ui-visual-designer** — bespoke visual direction (signature, type, layout, motion intent); refines the
  seed and re-anchors the winner to the CE brand.
- **stitch-prototyper** — builds each direction into a runnable throwaway HTML/React mockup (Stitch
  generate→build→`taste-design`); **not** Fluent.
- **mobile-ux-designer** — responsive + touch treatment (responsive-web-first; React Native reserved/future).
- **accessibility-engineer** — WCAG-AA audits (`chrome-devtools` a11y) of prototypes + the production port;
  gates convergence.
- **design-critic** — the adversarial **judge**: scores directions vs the rubric, ranks the gallery, runs the
  completeness critique.
- **fluent-spa-designer** *(re-created 2026-07-01; named `fluent-codeapp-designer` in older design-lab
  docs)* — implements production UI in the **Azure SWA** Fluent v9 SPA (`mockup-app/`), including porting a
  design-lab winner to Fluent v9 + CE brand + CSP. No Power Apps — the Code App era is decommissioned.
- **motion-demo-designer** *(optional)* — walkthrough/demo videos (`hyperframes` / `stitch-build:remotion`) +
  the winner's micro-interaction motion.

## Recommended guardrail hooks (see `.claude/settings.json`)
- **PreToolUse `azure-route-guard.mjs`** (`Bash|PowerShell`) → on a high-value Azure op (`az role|keyvault|monitor|functionapp`, `func azure … publish`, `psql`, KQL, Graph/Exchange-RBAC) injects a one-line **route reminder** (which skill/playbook to use). Non-blocking, low-noise, skips trivial reads.
- **PostToolUse `azure-churn-guard.mjs`** (`Bash|PowerShell`) → on the **2nd identical failure** of an Azure op, injects a **STOP** (two-strikes rule) pointing at `azure-diagnostics`/`azure-kusto`/`microsoft-docs`/the **azure-diagnostician** agent. Shared logic in `azure-guard-lib.mjs`. This is the deterministic anti-churn backstop behind [docs/azure/](./docs/azure/README.md).
- PreToolUse on the SPA deploy command → remind to `npm run build` first + hard-refresh.
- **[HISTORICAL]** the old Power-Platform hooks — PreToolUse on `pac code push` (build-first reminder) and
  PostToolUse on `mockup-app/src/**` `fetch(`/`azurewebsites.net` edits (use-a-connector / CSP reminder) —
  no longer apply: the SPA calls the API over plain REST, so a `fetch` to the API is **expected**; the live
  concern is **CORS on `cespk-api-dev` + the SWA origin** and attaching the **MSAL bearer token**.
