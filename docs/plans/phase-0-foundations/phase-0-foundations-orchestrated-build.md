# Plan: Phase 0 — Foundations, orchestrated multi-agent build (`collisionspike`)

## Context

`collisionspike` is a fast Power Platform spike of the Collision Engineers case-intake workflow
(Code App + Dataverse + Power Automate, with Azure Functions wrapping the parser/enrichment, and an
EVA "Sentry" REST/JSON export). The repo today is **docs-only** — 10 ADRs, the data model, the
requirements, and 5 domain agents + 3 skills under `.claude/`. There is **no application code yet**.

> **STATUS UPDATE 2026-06-18:** This plan has been fully executed. The Code App, Dataverse schema
> (11 tables), and parser/enrichment Azure Functions are deployed in the Sandbox. Email intake flows
> (`CS Intake`, Provider Match, Case Resolve) are ON and verified — a test email created a real
> `cr1bd_cases` row. Remaining flows (Classify+Persist, Parse, Status Evaluate, Enrich, Finalize,
> Chaser, Job Sheet) are authored and imported but currently OFF. Proceed to Phase 1 for the
> remaining downstream-flow activation, corpus incorporation, parser connector fix, and
> address-matching work.

This plan builds **Phase 0 — Foundations**, the front of the decided **M1 vertical slice** (PLAN.md
lines 108–121): scaffold the Code App, stand up the `CollisionSpike` Dataverse solution + schema,
port the shared TypeScript contracts (EVA 12-field payload, image-rules, case-status), and define the
env-var feature gates. Per the user's instruction it is extended to the **deployable, non-inbox part
of M1** so the app actually *does something* end-to-end: the parser Azure Function + DVSA enrichment
wrapper + EVA drag-drop export, provable on fixtures with **no live inbox contact**.

**Why now / intended outcome:** a runnable Code App with a real Dataverse schema, the contract layer
the whole programme inherits, and a parser→12-field-JSON→EVA-export path proven offline — leaving the
user a clean, gated set of live steps (logins + inbox automation) to flip on themselves.

**M1 feature gates (from PLAN.md / integrations.md):** `PDF_MAPPER_ENABLED`=on, `ENRICHMENT_ENABLED`
=on (DVSA only), `EVA_API_ENABLED`=off (drag-drop JSON path; Sentry REST built vs test env, inert),
`AZURE_VISION_ENABLED`=off, `VALUATION_ENABLED`=off, `COPILOT_ENABLED`=off.

## Operating boundary (locked with the user)

| Action class | Who | Why |
|---|---|---|
| All source / schema-as-code / IaC / TS contracts / flow *definitions* | **Me — offline, in the Workflow** | no tenant contact, fully reversible |
| Interactive logins: `pac auth`, `az login`, connector OAuth consent | **User** | browser/MFA — my shell is non-interactive |
| Deploy Code App, Dataverse tables/env-vars, parser + DVSA Functions, Key Vault, connectors, Entra app | **Me — guided, after user is logged in, confirming each irreversible step** | live + billable, but **not** inbox-touching |
| Power Automate **intake flows**, **email categorization/tagging**, **SharePoint** job-sheet mirror, **Box** finalization | **Authored by me, deployed/activated by User** | touch live inboxes / SharePoint / Box — reserved |
| Live testing against real inboxes / SharePoint / Box | **User** | real client email + PII |

**Architectural consequence:** the autonomous multi-agent **Workflow does offline build + verify
only** (it cannot pause for a browser login or per-step confirmation). **Deployment is a separate
guided sequence** I run with the user afterward — nothing live runs inside the unattended Workflow.

## Scope decisions (baked in — flip any at approval)

- **(a) Scope = Foundations + deployable non-inbox M1.** Includes the parser Function + EVA export +
  DVSA enrichment wrapper; excludes deploying any inbox automation.
- **(b) Schema = all 10 tables defined, M1-four deployed.** Author all 10 from `data-model.md`
  (Case, WorkProvider, Repairer, InspectionAddress, ImageSource, Evidence, AuditEvent,
  ImprovementSignal, Chaser, Note) as schema-as-code; deploy only Case, Evidence, WorkProvider,
  AuditEvent live in M1; the other six are defined-and-staged.
- **(c) Scaffold = hand-author the full React/Vite tree** matching the canonical `pac code init`
  layout (per the `code-apps-preview:create-code-app` skill), with a `power.config.json` template +
  bootstrap runbook, so the app exists immediately and `pac code push` works cleanly later.

## Agent fleet, models, effort

Six subagents (all `model: inherit` = **Opus 4.8**; effort tuned quality-first per ultracode). The
plugin `code-app-architect` owns the shell; our five domain agents own their slices and defer across
boundaries. `power-automate-flow-builder` authors **definitions only** (do-not-deploy).

| Agent | Owns (offline) | Effort |
|---|---|---|
| **code-app-architect** (plugin) | React/Vite tree, `PowerProvider`, screens skeleton (intake queue / case detail / readiness), `src/theme` from the design skill, Dataverse TS-model placement, build/lint | high |
| **dataverse-data-architect** | `CollisionSpike` solution spec, all 10 table specs, relationships (Repairer↔WorkProvider N:N, ADR-0001), provenance pattern, case-status + provenance choice sets, **env-var manifest**, ALM notes | high |
| **eva-sentry-integration** | `src/contracts/{eva-export,image-rules,case-status}.ts` (re-implement collisioncc, do **not** call it), `contracts/eva-payload.schema.json`, Vitest + `Final Format Example 02.json` parity, drag-drop export | high |
| **document-parser-engineer** | `cedocumentmapper_v2.0` clean HTTP entry point over the existing service/exporter seam, contract-lock test vs the shared schema, Function packaging note (PyMuPDF is **approved** — no AGPL) | medium-high |
| **azure-integration-engineer** | Bicep for parser Function + DVSA enrichment Function + Key Vault (secret **references** only), Function HTTP wrapper, custom-connector OpenAPI (gated), Entra app-reg spec, deploy runbook | high |
| **power-automate-flow-builder** | **Definitions only, do-not-deploy:** intake flow per mailbox, classify+categorize, finalization (EVA+Box), chaser scaffolds; + the Dataverse interface contract flows write to | medium |

Skills/MCP in play: `collision-engineers-design` (brand theme), `code-apps-preview:*`
(create-code-app, add-dataverse, add-office365/sharepoint/onedrive, add-connector), `azure:*`
(azure-prepare, entra-app-registration, azure-rbac, azure-ai), `eva-sentry-api`, `microsoft-docs:*`;
MCP: microsoft-docs, azure, context7. (No `/batch` skill exists — the Workflow tool **is** the
batch/orchestration mechanism.)

## The orchestrated Workflow (offline build + verify; 3 phases, 2 barriers)

```
Phase A — Foundations (parallel; barrier = contracts + env-var names frozen)
  eva-sentry:  eva-payload.schema.json FIRST -> eva-export/image-rules/case-status + parity tests
  dataverse:   solution + 10 table specs + choice sets + env-var manifest   (case-status, env names out)
  code-app:    React/Vite tree + PowerProvider + screens + theme (vs stubbed contracts/models)
  parser:      HTTP entry point + contract-lock test + packaging note       (consumes the schema)
        |
   [Barrier 1: shared JSON schema published; case-status choice set + env-var names frozen]
        |
Phase B — Wrapping (parallel)
  azure:       Bicep (parser Fn + DVSA Fn + Key Vault) + HTTP wrapper + connector OpenAPI + Entra spec
  code-app:    swap stubs for real contract TS; finalize Dataverse model placement; build/lint
  flow-builder: author intake / categorize / finalization / chaser DEFINITIONS (do-not-deploy)
        |
   [Barrier 2: all source artifacts exist]
        |
Phase C — Integrate + verify (offline only)
  run: tsc --noEmit, vite build, eslint; vitest contracts; pytest + http-entry contract test;
       validate Final Format Example 02.json vs eva-payload.schema.json; az bicep build/lint;
       OpenAPI + solution/table XML well-formedness
  reconcile parser(JSON) == TS(contract) against the SAME schema; assemble the go-live runbook
```

Single keystone: **`contracts/eva-payload.schema.json`** is authored first and is the synchronization
point binding the TS contract tests *and* the Python parser's contract-lock test. The only hard
coupling besides it is case-status (Dataverse choice set ↔ `case-status.ts`), produced once and
reconciled in Phase C.

## Deliverables — offline artifacts (representative paths)

- **Code App:** `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`,
  `src/PowerProvider.tsx`, `power.config.json.template`, `src/screens/*`, `src/components/*`,
  `src/theme/*`, `src/generated/dataverse/*` (typed stubs → real).
- **Contracts:** `src/contracts/{eva-export,image-rules,case-status}.ts` + `*.test.ts` +
  `__fixtures__/`; `contracts/eva-payload.schema.json`.
- **Dataverse-as-code:** `dataverse/solution/solution.spec.md`, `dataverse/tables/*.table.md` (×10),
  `dataverse/relationships.md`, `dataverse/choices/{case-status,provenance}.md`, `dataverse/env-vars.md`.
- **Parser (sibling repo `cedocumentmapper_v2.0`):** `src/cedocumentmapper_v2/application/http_entry.py`,
  `tests/test_http_entry_contract.py`, `docs/azure-function-handoff.md`. (Complete & harden — **no
  rewrite**; PyMuPDF approved.)
- **Azure IaC:** `infra/parser-function/{main.bicep,function_app.py}`,
  `infra/enrichment-function/main.bicep`, `infra/keyvault/main.bicep`,
  `infra/connectors/*.openapi.json`, `infra/identity/entra-app-reg.md`.
- **Flow definitions (do-not-deploy):** `flows/{intake,classify,finalization,chaser}.definition.json`
  + `flows/dataverse-interface.md`.
- **Runbooks:** `docs/runbooks/code-app-bootstrap.md`, `docs/runbooks/azure-deploy.md`,
  `docs/runbooks/go-live-checklist.md`.

## Design system

`collision-engineers-design` is invoked **by code-app-architect** during the theme step — tokens
(`colors_and_type.css`), fonts (Tw Cen MT / Futura), the two brand reds, and UI-kit components land
as a typed `src/theme/` module consumed app-wide (not inline styles), so branding can't drift. The A4
letterhead/document system is noted for later (report/Fee-Note rendering is out of M1 scope).

## Offline verification (no live call — runs inside Phase C)

`tsc --noEmit` + `vite build` + `eslint`; `vitest run src/contracts` (incl. parity vs
`Final Format Example 02.json`); `pytest` in the parser repo incl. the http-entry contract test;
JSON-schema validation of the example payload; `az bicep build` + `bicep lint` (compile only —
`what-if` is login-gated, documented for the user); OpenAPI 2.0 lint; XML well-formedness of any
emitted solution/table components. Zero tenant/Azure/EVA/Box/Outlook contact.

## Guided deploy (interactive, AFTER the Workflow — non-inbox only)

Once the user has run `pac auth create` + `az login` (+ connector consent), I drive, **confirming each
irreversible step**: import the `CollisionSpike` solution + create env-vars; deploy parser + DVSA
Functions + Key Vault (user injects secrets from Infisical — I never echo them); import custom
connectors; `pac code push` the app. **Excluded from my deploy:** intake/categorize/finalization/
chaser flows, SharePoint mirror, Box — handed to the user as importable definitions + the go-live
checklist.

## Reserved for the user (never automated)

Interactive logins; activating any inbox/SharePoint/Box automation; all live-inbox testing; EVA
**production** cutover (gated until a parity test passes; M1 stays on the test env / drag-drop).

## Risks & mitigations

1. **`pac code init` interactivity / file ownership** — hand-authored tree matches the skill's
   canonical layout; `power.config.json` stays a template (no real env/app ids committed); bootstrap
   runbook documents the adopt step. Fallback: user runs `pac code init` first, agents fill in.
2. **PyMuPDF in the Function image** — licensing is **settled (approved)**; the real concern is the
   Linux container (PyMuPDF wheels + Tesseract binary). azure agent uses a container/Flex image;
   parser flags binary deps in the handoff note.
3. **Secrets** — Key Vault holds values; Dataverse secret env-vars hold **Key Vault references**;
   Infisical is the source; **no artifact contains a secret, nothing is echoed**.
4. **Code App Preview / Premium licensing** — surfaced as a USER-LATER blocker in the bootstrap
   runbook; nothing offline depends on it.
5. **Contract drift** — re-implement collisioncc, never call it at runtime; the
   `Final Format Example 02.json` parity fixture is the objective anchor; Phase C reconciles
   Python ↔ TS against the one schema.

## Execution after approval

Author and run the Workflow described above (offline build + verify), then walk the user through the
guided non-inbox deploy. The Workflow script is expanded from the Phase A/B/C structure above with
per-agent prompts, a shared `eva-payload.schema.json` keystone, and Phase-C verification gates.
