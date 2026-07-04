# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`collisionspike` is a **fast, early spike** of the Collision Engineers case-intake workflow. It
de-risks the mature cloud build, **`collisioncc`** (a Next.js + Google Cloud app), which is
**reference/context only** — re-implement its contracts; do **not** call it at runtime.

**Live platform (as of 2026-06-28): pure Azure PaaS.** The spike has been **migrated off the
Microsoft Power Platform** (its original implementation — a Power Apps **Code App** + Dataverse +
~16 Power Automate flows + custom connectors) **onto the Azure stack below** — the orchestration that
replaces the flows is now **deployed (2026-06-27)**, so every Power Platform capability has a live Azure
home. The Power Platform footprint has now been **deprovisioned (2026-06-27)** — the Dev sandbox, both
solutions, the Code App, custom connectors, connections, and the `case-resolve` flow were deleted via
`pac admin delete` (the `CollisionSpike` solution was cold-exported off-repo first; the flow definitions
were removed in the migration purge — the cutover narrative survives in [docs/HISTORICAL/migration/](./docs/HISTORICAL/migration/)). **Only the platform mechanism changed** — the **domain model, EVA 12-field contract, image rules, provider corpus, and Case/PO format
below are unchanged**. The executed cutover **narrative** lives in [`docs/HISTORICAL/migration/`](./docs/HISTORICAL/migration/);
the repo-root **`migration/`** is **retained, not temporary** — it holds the **canonical live Postgres DDL**
(`migration/assets/schema/*.sql`) plus the reversible-build assets (see
[`migration/README.md`](./migration/README.md)).

The live Azure stack lives in resource group **`rg-collisionspike-dev`** (region **uksouth**), inside
the **Azure Free-Trial** subscription `e6076573-…` (quotaId `FreeTrial_2014-09-01`):

- **SPA** — Static Web App **`cespk-spa-dev`** (control-plane region `westeurope`,
  `https://proud-sky-04e318b03.7.azurestaticapps.net`) serving the **preserved** React/Vite app from
  `mockup-app/`, with **Entra/MSAL workforce sign-in** (staff-only). It calls the Data API over REST
  (`mockup-app/src/data/rest-client.ts`) — **no Power SDK**.
- **Data API** — Function App **`cespk-api-dev`** (Node 20 / TypeScript Functions v4; source `api/`,
  esbuild bundle `deploy/api/main.cjs`). Validates Entra JWTs (`jose`) and the app roles
  **`CollisionSpike.User` / `CollisionSpike.Superuser`** (Superuser = full privileges, renamed from
  `Admin` 2026-06-27 keeping the same role-id so the assignment carried over; plus a deferred
  **`CollisionSpike.Engineer`** placeholder app-role) — the roles that replace the old Dataverse security
  roles; v2 tokens carry `aud` = the API client-id GUID `fa2fb28c…`). Connects to Postgres; owns the
  status-machine, dedup, audit, and gate reads.
- **Orchestration** — Function App **`cespk-orch-dev`** (source `orchestration/`, esbuild bundle
  `deploy/orch/main.cjs`) — deployed + wired and **email intake is LIVE** on the production mailbox set.
  Transport is Microsoft Graph **change-notification subscriptions (PUSH)** — NOT delta-poll — over
  **Exchange-RBAC-scoped** mailboxes (no Global-Admin consent; subscription-create rides on the RBAC
  `Application Mail.Read` grant). Live push subscriptions cover the **production set info@ + engineers@ +
  desk@** (all RBAC-scoped; the **2026-06-29 mailbox cutover** added info@ + desk@ and removed the test/dev
  mailbox **digital@**), kept alive by the durable `subscriptionMonitorOrchestrator`.
  Function count + subscription/RBAC state: see the live registry
  [docs/architecture/live-environment.md](./docs/architecture/live-environment.md) (single source:
  [LIVE_FACTS.json](./LIVE_FACTS.json)). (The prior "ZERO functions" state was an esbuild ESM→CJS
  `import.meta.url` bundle crash — fixed via `build-orch.cjs`.)
- **System-of-record DB** — **Postgres Flexible Server `cespk-pg-dev`** (v16, database
  `collisionspike`): 36 tables, reference corpus seeded (work providers / repairers / image sources /
  inspection addresses; `case_` 0). Live counts: see the registry
  [docs/architecture/live-environment.md](./docs/architecture/live-environment.md) (single source:
  [LIVE_FACTS.json](./LIVE_FACTS.json)) — banded last-known/unverified-this-snapshot there.
- **Retained** — the **6 Python Functions** (parser `cespike-parser-dev`, enrichment, evasentry,
  evavalidation, ocr, and **box-webhook** — the last **migrated 2026-06-27** off Dataverse + a Power
  Automate flow onto the **Data API/Postgres** via its managed identity), the Key Vaults, Blob
  `cespkevidstdev01`, and App Insights / Log Analytics.

**Honest live state (do not paper over).** (1) **Email intake is LIVE on the production mailbox set** — the
orchestration app runs **Graph PUSH subscriptions** over **info@ + engineers@ + desk@** (all Exchange-RBAC
app-read scoped; the **2026-06-29 mailbox cutover** added info@ + desk@ — their subscription creates
succeeded once the ~30min–2h Exchange-RBAC permission cache cleared — and removed the test/dev mailbox
**digital@**). ✅ **Graph renewal RESOLVED (2026-06-29):** subscriptions are kept alive by a Durable eternal
orchestration (`subscriptionMonitorOrchestrator`) — a durable timer wakes the scale-to-zero FC1 app, which a
plain NCRONTAB timer can't; the `graph-renew` timer is retained only as a backstop. ⚠️ Operator watch-items:
confirm an **unattended renew** at the next ~6h durable-timer wake, and add a subscription-**prune** step (a
mailbox removed from `GRAPH_INTAKE_MAILBOXES` isn't yet auto-deleted — why digital@ had to be removed by
hand). `graph-webhook` still emits some `499`/cold-start aborts; intake still flows (Graph retries absorb the
misses). Manual case-create remains available alongside. Live subscription state: the registry
[docs/architecture/live-environment.md](./docs/architecture/live-environment.md).
(2) **Postgres security (P0 + P2 — RESOLVED 2026-06-26):** the Data API connects as a **non-owner login
`cespk_app`** (no superuser, no `BYPASSRLS`) whose password is a **Key Vault reference** (no cleartext),
so the authored **Row-Level Security is now enforced** (the prior `csadmin` owner bypassed it) and the
audit trail is append-only at both the grant and RLS layers; the per-connection DB app-role is set via
the libpq `-c app.role=staff` startup option (`PGAPPROLE`). A **2026-06-27 sweep** then closed the
**other** plaintext exposures too — the **Graph client secret** (rotated → KV ref), the **storage-account
keys** on the api + orch apps (→ identity-based storage, shared-key disabled), the **DocIntel key**
(→ keyless, local-auth disabled), and the **retained-function keys** (→ KV refs); the orch managed
identity (previously **un-granted**) now holds its KV/Storage/Queue/Table roles. No plaintext secrets
remain in app-settings (only the App Insights connection string, which Microsoft does not class as a
secret). (3) **Free-Trial → Pay-As-You-Go
deadline:** the whole stack disables at the ~30-day mark unless upgraded to PAYG (the 12-month free
Postgres allowance survives the upgrade). (4) **Staff app-role assignment is incomplete** — only ONE
staff principal is app-role-assigned so far; others 403 until assigned. (5) **Durable auth
error-handling + token-audience-form hardening** are in progress.

> **Prior platform (decommissioned, banded historical).** Before the migration the spike ran as a
> Power Apps **Code App** (`mockup-app/`, app `da7ba7af-…`) in the **`Collision Engineers - Dev`**
> sandbox (`b3090c42-…`), wired to **Dataverse**, with ~16 Power Automate cloud flows, custom
> connectors (incl. `cr1bd_box_rest`), and the **Phase 7 Box-centric intake pivot** (ADR-0012). All
> `BOX_*` gates were `false` then; **Box has since gone live (JWT Server Auth, 2026-06-28)** — `BOX_API_ENABLED`
> / `BOX_FOLDER_AT_INTAKE_ENABLED` / `BOX_FILEREQUEST_ENABLED` are now `true` on the Azure stack (`BOX_EMBED` /
> `BOX_METADATA` stay off); see the registry [docs/architecture/live-environment.md](./docs/architecture/live-environment.md).
> The Power Platform stack was torn down per
> [`migration/90-deprovision-power-platform.md`](./docs/HISTORICAL/migration/90-deprovision-power-platform.md); treat
> any Dataverse / Power Automate / Code App / `pac`-driven detail elsewhere in the docs as the
> **prior era**, not the live system.

Read first: [README.md](./README.md), [CURRENT_STATUS.md](./CURRENT_STATUS.md) (live state),
[ROADMAP.md](./ROADMAP.md) (**the single forward worklist — its § Now / Next / Later is the start-here for
what's next**; the old `OPEN_ITEMS.md` was merged into it), [docs/architecture/live-environment.md](./docs/architecture/live-environment.md)
(the live registry), [docs/HISTORICAL/migration/](./docs/HISTORICAL/migration/) (cutover record),
[docs/HISTORICAL/PLAN.md](./docs/HISTORICAL/PLAN.md) (historical narrative plan — ROADMAP.md is the live forward plan),
[docs/architecture/repo-constellation.md](./docs/architecture/repo-constellation.md).
What needs the operator: [docs/gated.md](./docs/gated.md). **Activating Box:**
[docs/azure/box-activation.md](./docs/azure/box-activation.md).

## Layout & documentation map

```
README.md            project overview        ROADMAP.md          forward phased checklist (the live worklist)
CLAUDE.md            this file                CURRENT_STATUS.md   what is live now
AGENTS.md            operating rules + gotchas CONTEXT.md         domain glossary / canonical terms
LIVE_FACTS.json      machine-readable live registry (human mirror: docs/architecture/live-environment.md)
migration/           RETAINED: canonical live Postgres DDL (assets/schema/) + reversible-build assets
                     (the executed PP→Azure cutover NARRATIVE lives in docs/HISTORICAL/migration/)
api/  orchestration/ LIVE Azure: TS Data API (BFF) + Durable/Graph orchestration Function Apps
docs/
  gated.md           hard/soft operator-blocker registry (everything that needs the user)
  plans/             one folder per phase, each with an ordered build checklist; index = plans/README.md
  reviews/           BINDING dated manual reviews — see docs/reviews/README.md
  adr/               architecture decision records 0001–0018 (0015–0018 Proposed)
  architecture/      microsoft-stack, data-model, eva-*, integrations, live-environment (canonical), environment (historical)
  requirements/      admin-overview, intake-workflow, provider-corpus, inspection-address, company-background
  design/  research/  activation/  reference/   UI spec · forward research · operator playbooks · external specs
  README.md          the docs index
```

**`docs/plans/to-integrate-into-phases/` is a drop-zone** for shorthand operator notes pending
distillation: a note is distilled into the relevant `plans/`, ADR, and `docs/`, then the note stub is
**removed** once distilled (data files dropped alongside may be **retained** where still referenced —
e.g. `inspection-address-revamp/fullevaexportinspectionaddresses.xlsx`).

**Where things live / precedence.** Phases (**ROADMAP 0–6**) are the **work-breakdown** axis;
Milestones (**M0/M1/M2/M3**) are **capability slices that cut across phases** — authoritative map in
[docs/plans/milestone-model.md](./docs/plans/milestone-model.md). **Never equate a Phase with a
Milestone** (e.g. Phase 3 holds M1 EVA drag-drop *and* M2 EVA-REST; valuation in 5c is M3). Roles: **ROADMAP** = forward checklist · **CURRENT_STATUS** = live now ·
**docs/gated.md** = needs the operator · **docs/plans/&lt;phase&gt;/README.md** = the ordered build steps.
When docs disagree, precedence is: a **binding review** (docs/reviews/&lt;DDMMYY&gt;/) > **ADRs** >
**architecture/requirements** specs > **plans** — reconcile the older/lower doc to the higher one.

**Binding reviews.** `docs/reviews/<DDMMYY>/` holds **manual user reviews** — the **authoritative spec**
for the areas they cover, **superseded only by a later review** (outranking older docs/plans/ADRs/code).
When a review and an older doc disagree, the review wins; reconcile the older doc to it. Method:
[docs/reviews/README.md](./docs/reviews/README.md).

## Doc maintenance protocol

**Live numbers live in ONE place.** Function counts, Postgres corpus counts, the mailbox set, Graph
subscription/RBAC state, feature-gate values, and `httpsOnly` live **only** in
[`LIVE_FACTS.json`](./LIVE_FACTS.json) (machine-readable source of truth) mirrored in
[`docs/architecture/live-environment.md`](./docs/architecture/live-environment.md) (human mirror).
**Every other doc links the registry — never re-embed the number.** `memory/**` is exempt.

After any live Azure change: update `LIVE_FACTS.json` (bump `lastVerified`) + the mirror, then run
`VERIFY_LIVE=1 node verify-all.mjs` to confirm reality matches (it skips cleanly offline). The
`scripts/check-doc-links.mjs` gate (broken links / orphans / live-number leakage) runs in the
pre-commit hook and CI. Activate the hook once: `git config core.hooksPath scripts/hooks`.

Full protocol + precedence hierarchy: [`docs/MAINTENANCE.md`](./docs/MAINTENANCE.md).

## Ticket-based planning

Granular work is tracked as **atomic Markdown tickets** in [`docs/tickets/`](./docs/tickets/README.md) —
the layer **under** ROADMAP.md (ROADMAP is the strategic Now/Next/Later; a ticket is one self-contained
item). **One ticket = one `.md` file** with YAML frontmatter:
`id` · `title` · `status` (`backlog`/`now`/`next`/`done`/`blocked`) · `priority` (`P0`–`P3`) · `area` ·
`tickets-it-relates-to` (ids, or `[]`) · `research-link` (path to the backing research pack). The
[`BOARD.md`](./docs/tickets/BOARD.md) tracker mirrors each ticket's column (Now / Next / Backlog / Done).
**Lifecycle:** a `work-todo-spike` operator stub + fan-out research pack → distilled into a ticket
(`backlog`) → `now`/`next` when picked up → `done` (or `blocked` on an operator/dependency).

**Research packs are advisory aids — verify, don't trust.** The packs under
[`docs/plans/work-todo-spike/`](./docs/plans/work-todo-spike/) (linked from each ticket) are detailed
fan-out research, but any live fact (counts, gates, mailbox set, function/route names) must be checked
against the registry ([live-environment.md](./docs/architecture/live-environment.md) / `LIVE_FACTS.json`)
before acting — they are point-in-time snapshots, not the source of truth. Validate the board with
`node scripts/check-tickets.mjs` (frontmatter present, enums valid, `research-link` resolves, ids unique).

## Related repos (in the `collisionsuite/` tree — ideas/prior-art only, NONE canonical, do not modify)

These hold **ideas and references** to Collision Engineers' processes — mine and adapt them; they
are not authoritative. The binding design is the spike's own distilled `docs/` + the `raw/` inbox.
Paths are relative to this repo, now at `collisionsuite/active/collisionspike/` (reorganised 2026-06-23).

- **cedocumentmapper_v2.0** (`../cedocumentmapper_v2.0` — active sibling) — the document parser, and the
  **one exception to the "prior-art only / do not modify" framing above**: it is the **authoring source of
  truth** for the engine that is **vendored + live** in this repo's parser Function (edit-in-sibling-first,
  then re-vendor — see [ADR-0018](./docs/adr/0018-cedocumentmapper-dual-target-vendored-engine.md),
  [repo-constellation](./docs/architecture/repo-constellation.md), and that copy's `PROVENANCE.md`). It is a
  **standalone dual-target product**: a single-user **desktop review GUI** (React + pywebview; portable
  PyInstaller exe via `build.ps1`) **and** a headless **engine-core for the cloud** (our Azure Function). The
  engine core is **complete & tested** — the old "~75%, UI/packaging outstanding" line is **stale**; it now
  also has the GUI, packaging, an opt-in extraction orchestrator + offline LLM-assist, and an eval harness
  (all **desktop/dev-only — NOT on the vendored cloud path**). PyMuPDF is **licensed** (AGPL resolved). Reuse
  the engine; don't re-derive parsing in the API/SPA.
- **ccc** (`../../archive/ccc`) — programme planning, skills, and **draft** contracts. Prior art to adapt.
- **collisioncc** (`../../archive/collisioncc`) — a mature reference build on Google Cloud; useful source
  of the EVA Sentry API detail, `case-status`, `image-rules`, provider knowledge, and a **pricing
  guide**. Reference only.
- **cedocumentmapper** (`../../archive/cedocumentmapper`) — legacy v1 Tkinter monolith; behaviour reference only.
- **collisionplugin** — **dissolved 2026-06-23.** Its MCP enrichment connectors now live under
  `../../connectors/` (`dvla-dvsa-connector`, `valuation-adverts-connector`, `mcp-gateway`,
  `report-renderer`) and its skills under `../../skills/`. **M1 enrichment bypasses these entirely:
  the enrichment Azure Function calls DVSA + DVLA directly via Entra `client_credentials` + X-API-Key
  (no Google Cloud gateway in the path).** The gateway/valuation connectors remain prior-art for
  later phases (valuation, M2+).

Full map: [docs/architecture/repo-constellation.md](./docs/architecture/repo-constellation.md)
(partly stale after the 2026-06-23 reorganisation into `collisionsuite/`).

## Domain model (business rules any implementation must honor)

Pipeline: **intake (3 Outlook shared inboxes) → parse + classify → human review → enrich → export
to EVA + archive to Box → audit/dedup**. Cases can arrive partial (instructions without images, or
images without instructions) and are held with a chaser workflow until complete.

- **Case/PO format:** `Principal` (a **leading-alpha** internal provider code — typically 4 chars, 2–5
  observed) + 2-digit year + 3-digit provider case number, e.g. `CCPY26050`. Box folder is named with this.
- **EVA photo order:** upload **2 preview photos** (vehicle overview + main-damage closeup) first,
  then **all** photos in sequence **including those two again**. The overview must show the full
  registration.
- **Photo exclusion:** any photo showing a person's reflection is unusable.
- **Image rules / case-status** mirror `collisioncc` (`src/lib/image-rules.ts`,
  `src/lib/case-status.ts`): ≥2 EVA images incl. one `overview` (registration visible) + one
  `damage_closeup`; status `new_email → ingested → needs_review → ready_for_eva → eva_submitted`.
- **Inspection address** comes from an **offline-derived, full-address-only suggestions corpus**
  (live Postgres table `inspection_address` — confirmed + suggested rows; counts in the registry
  [docs/architecture/live-environment.md](./docs/architecture/live-environment.md); was the Dataverse
  `cr1bd_inspectionaddress` table) that staff **pick/edit manually**, falling back to "Image Based
  Assessment" with a reason. `Loc` is an **EVA-export artifact, not an intake input**, and there is
  **no runtime address matcher** (the one that misread `Loc` was removed 2026-06-23). See **ADR-0013**
  and `docs/architecture/inspection-address-corpus.md`.
- **Enrichment:** valuation evidence (Companion Report PDF), mileage (from MOT), Experian
  adverse-history (EVA built-in).

## Integration & gating

All non-trivial integrations are **feature-gated**. Under the live Azure stack the gates are **Function
app-settings** that the Data API + orchestration apps read (they were **Dataverse environment variables**
in the prior Power Platform build); the names and **default-off** *semantics* are unchanged (but the **live
values** live in the registry, not here — **`ENRICHMENT_ENABLED` and `PDF_MAPPER_ENABLED` are currently
`true`** on the live stack, as are the three live `BOX_*` gates below):
`EVA_API_ENABLED`, `PDF_MAPPER_ENABLED`, `ENRICHMENT_ENABLED`, `AZURE_MAPS_ENABLED`,
and the **Phase-7 `BOX_*` set** — `BOX_API_ENABLED`, `BOX_FOLDER_AT_INTAKE_ENABLED`,
`BOX_FILEREQUEST_ENABLED`. **EVA** has
two paths: JSON drag-drop export now; **Sentry REST API later** (gated). The drag-drop path is current
because Minotaur Software's Sentry API supports only **one principal code** per API submission (it cannot
route different work-provider codes); REST stays gated pending Minotaur's patch.
**Box (Phase 7, ADR-0012)** is an **additive, one-way mirror** (**Postgres** is now the system of record —
Dataverse was, in the prior build): **evidence is linked, not embedded** — a server-minted "Open in Box"
deep link, so there is **no iframe and no `frame-src` edit**.
**Box auth is JWT "Server Authentication"** (the whole app `Config.JSON` in one Key Vault secret —
`cespkboxkvv76a47/box-config-json`), **not CCG.** As of **2026-06-28 Box is LIVE**: the `Config.JSON` is wired
into Key Vault, the `BOX_*` gates **`BOX_API_ENABLED` / `BOX_FOLDER_AT_INTAKE_ENABLED` / `BOX_FILEREQUEST_ENABLED`
are `true`** on both `cespk-api-dev` + `cespk-orch-dev` (`BOX_FOLDER_ROOT_ID=392761581105`), and an
authenticated smoke call to the allowed root returned **200** (folder
`CCPY26050`). Remaining Box-side items (operator): the template File Request id + the `FILE.UPLOADED` webhook
subscription. Gate states: the registry [docs/architecture/live-environment.md](./docs/architecture/live-environment.md).
Step-by-step: [docs/azure/box-activation.md](./docs/azure/box-activation.md).
The non-byte Box operations that formerly ran through a Power Platform **custom connector**
(`cr1bd_box_rest`, with the service-identity token minted inside the `box-webhook` Function — never the
connector) are, in the Azure design, carried by the **retained `box-webhook` Function plus the
orchestration app**; the Power Platform connector itself is decommissioned.
Detail: [docs/architecture/integrations.md](./docs/architecture/integrations.md).

## Azure task routing (invoke the skill — don't hand-roll and churn)

The live stack is pure Azure PaaS. Before hand-rolling `az`/`func`/`psql`/KQL for any **non-trivial**
Azure task, match it below and **invoke the named skill/tool first** — the skills encode the procedure +
footguns; raw CLI is the fallback. Full playbooks: **[docs/azure/README.md](./docs/azure/README.md)**.

| Task | Invoke first → | Playbook |
|---|---|---|
| Diagnose a live Function/API/orch error or outage | `azure:azure-diagnostics` → `mcp__azure__applens`/`resourcehealth`; dispatch **azure-diagnostician** | `diagnose.md` |
| Read App Insights / Log Analytics (KQL) | `azure:azure-kusto` / `mcp__azure__monitor` (Win: `--analytics-query "@q.kql"`) | `logs-kql.md` |
| Build + deploy API / orch / SWA | `azure:azure-validate` → `azure:azure-deploy`; `mcp__azure__get_azure_bestpractices` | `deploy.md` |
| Grant RBAC / managed identity | `azure:azure-rbac` → `mcp__azure__role` (here `az role assignment` 500s `MissingSubscription` → ARM) | `identity-rbac.md` |
| Secrets / Key Vault / rotation | `azure:azure-compliance` + KV-ref pattern → `mcp__azure__keyvault` | `secrets-keyvault.md` |
| Entra app-reg / token audience / Graph subs / Exchange-RBAC | `azure:entra-app-registration`; `microsoft-docs:microsoft-docs` | `entra-graph.md` |
| Postgres ops (RLS, app.role, audit) | `mcp__azure__postgres` / `psql` | `postgres.md` |
| Understand any Microsoft behavior/limit/error | `microsoft-docs:microsoft-docs` **before** retrying | — |
| What's deployed / inventory | `azure:azure-resource-lookup` → `mcp__azure__group_resource_list` | README |

**Anti-churn doctrine** (the point): (1) **Two strikes → stop** — if the same Azure op fails twice, don't
run it a third time; invoke the matching skill or `microsoft-docs` to learn *why* first (the
`azure-route-guard`/`azure-churn-guard` hooks enforce this). (2) **Skill before CLI** for non-trivial ops.
(3) **Docs before retry** when a behavior/limit/error is unclear. Live registry:
[docs/architecture/live-environment.md](./docs/architecture/live-environment.md); deep gotchas:
[AGENTS.md](./AGENTS.md) + `memory/azure-*`.

## Tooling & conventions

- **Live stack tooling (Azure PaaS):** `az` (Azure CLI) for Postgres / the API + orchestration
  Function Apps / Static Web Apps / managed identities / Key Vault grants; `func` (Azure Functions
  Core Tools) to run + deploy the API (`api/`) and orchestration (`orchestration/`) apps; `swa` /
  `az staticwebapp` to deploy the SPA; `psql` to apply the Postgres DDL + corpus seed; `npm` + Vite
  for the React SPA in `mockup-app/`.
- **Reference-only (prior Power Platform build, decommissioned):** the **Power Platform CLI** (`pac`,
  a global .NET tool — `pac code …`) drove the now-retired Code App; it survives only for
  export-for-reference and teardown (`pac admin delete`). Likewise the `code-apps-preview:*` skills.
- Relevant skills: `azure:*` (Document Intelligence, Functions, Postgres, Static Web Apps),
  `microsoft-docs:*` (Learn lookups).
- **Cross-platform — pick the platform BEFORE the tool** (dual-platform workstation; full table:
  [docs/azure/README.md §Platform routing](./docs/azure/README.md)): the **az/func/psql toolchain lives
  in WSL2 Ubuntu** (`wsl -e bash -lc '…'`; az logged in there) — deploys, Postgres DDL, Graph calls run
  from WSL; **node/npm/esbuild builds + git + offline gates run on Windows** (native `C:\` checkout);
  **Exchange-RBAC admin is Windows PowerShell only** (`ExchangeOnlineManagement`); docker/Linux-daemon
  work → WSL. Agents should state the platform choice when it isn't obvious. Git initialised on `main` —
  commit as work progresses (the predecessor tool's lack of version control was a known problem).

## Quick commands

```bash
node verify-all.mjs                       # offline build/contract/doc gate (skips live cleanly)
VERIFY_LIVE=1 node verify-all.mjs         # also diff live Azure vs LIVE_FACTS.json (needs az login)
node scripts/check-doc-links.mjs          # broken links / orphans / live-number leakage
git config core.hooksPath scripts/hooks   # activate the pre-commit doc gate (once)
npm --prefix mockup-app run dev           # run the SPA locally
# build + deploy api/orch (esbuild -> deploy/{api,orch}/main.cjs): see docs/azure/deploy.md
```

## Agent roster & boundaries

Project agents in `.claude/agents/`, skills in `.claude/skills/`. Each owns one slice and defers across
boundaries; **full descriptions + boundaries are in [AGENTS.md](./AGENTS.md)**. The roster predates the
Azure migration, so some agents now describe the **prior Power Platform mechanism** — keep their
**domain** guidance, but build against the **live Azure equivalents** below.

**Live (platform-current):**

- **azure-integration-engineer** — the live Azure stack end-to-end: the **Data API** (`cespk-api-dev`) + **orchestration** (`cespk-orch-dev`) Function Apps, **Postgres** (`cespk-pg-dev`), the **SPA** (`cespk-spa-dev`), the 6 retained Python Functions, Key Vault, managed-identity/RBAC, Entra/MSAL/JWT, Document Intelligence, and the Box-webhook Function. Routes through **[docs/azure/](./docs/azure/README.md)** + the `azure:*` skills.
- **azure-diagnostician** — **read-only** live triage: pulls App Insights/KQL, AppLens/resource-health, function lists, RLS/secret state, cross-checks Microsoft Learn, and returns a **root-cause + recommended fix**. Dispatch it for "why is X failing" instead of debugging inline; it applies nothing (fixes go to azure-integration-engineer).
- **eva-sentry-integration** — EVA Sentry REST v1.2, the 12-field JSON contract, photo-order/image rules, drag-drop export, Box. (EVA contract is platform-independent — unchanged by the migration.)
- The **`cedocumentmapper_v2.0` sibling** (Python; PyMuPDF licensed) is the parser engine's authoring source of truth; its clean **engine-core** is vendored into the parser Function's HTTP route (ADR-0004/0018). _(The former `document-parser-engineer` agent is retired — edit-in-sibling + re-vendor; **azure-integration-engineer** deploys it.)_

**Reference-only (prior Power Platform build, decommissioned — defer to the Azure components, not these mechanisms):**

- **power-automate-flow-builder** — authored the cloud flows (intake, dedup, status machine, parser/enrichment calls, EVA-submit + Box-sync, chasers). Live equivalent: the **TypeScript orchestration Function App** (`orchestration/`, Durable + Graph **PUSH** change-notification intake) plus the **Data API** (`api/`) that owns status-machine / dedup / audit.
- **dataverse-data-architect** — owned the `CollisionSpike` Dataverse solution (tables, provenance, env-var gates, auditing, ALM). Live equivalent: the **Postgres schema** (`cespk-pg-dev`, 36 tables + choiceset lookup tables + RLS) and the gates-as-app-settings the Data API reads.
- **`code-app-architect`** (code-apps-preview) — owned the Code App shell, React/Vite, connector *selection*, and `pac code` deploy. Live equivalent: the **SWA-hosted** React SPA (`mockup-app/` on `cespk-spa-dev`) with **MSAL/Entra** auth and the `rest-client.ts` data seam. **Do not** use `canvas-app-*` / `genpage-*` (never canvas/model-driven).
