# 91 — Documentation rewrite / delete (no legacy bloat)

The hardest discipline of the migration: leave **no Power Platform residue** in the docs. Mechanism
dies; domain knowledge survives. **Phase P9** (finalize) — except `CLAUDE.md`/`AGENTS.md`, rewritten
early in **P1** (R6). Method: **archive off-repo first, then delete** (D4) — copy every to-be-deleted
file to an off-repo archive (or orphan `archive` branch), then remove it from the working tree. Never
leave an in-repo "legacy/superseded" stub.

The lists below were produced by **walking the real tree** (every path is verified to exist as of
2026-06-26). Each path is classified by the three-question test.

## The test applied to every doc
1. Does it describe a **platform mechanism** (Dataverse, Power Automate, Code App, `pac`, custom
   connectors, `BOX_*`/gates as Dataverse env-vars, AI Builder)? → **DELETE** (after its successor
   exists), archived first.
2. Does it describe **domain knowledge** (intake rules, EVA contract, image rules, provider corpus,
   inspection-address policy, dedup intent, retention policy, role taxonomy)? → **KEEP**, light-edit if
   it names a platform mechanism.
3. Is it a **narrative/index** mixing both? → **REWRITE in place** describing the Azure stack.

---

## DELETE (archive off-repo, then remove) — after the successor exists

### Source artifacts (successor = `migration/assets/schema/` + the new apps; delete only after P2 DDL + parity authored)
- `flows/` — all 16 definitions under `flows/definitions/` (`intake`, `intake-shared-mailbox`,
  `classify-persist`, `triage-classify`, `parse`, `provider-match`, `jobsheet-import`,
  `status-evaluate`, `enrich`, `case-disposition`, `case-resolve`, `chaser-draft`, `chaser-send`,
  `finalize-eva-box`, `box-folder-create`, `box-file-request-copy`, `box-blob-purge`) **plus**
  `flows/connection-references.json`, `flows/flow-state.json`, `flows/validate-flows.mjs`,
  `flows/README.md`. Successor = the Durable/queue Functions in [`22`](./22-orchestration-migration.md).
- `dataverse/` — the whole tree: `schema/` (12 table JSON + 2 `_*.schema.json`), `choicesets/` (17),
  `roles/` (2 + `_role.schema.json`), `environment-variables.json`, `relationships.json`,
  `verify-parity.mjs`, `case-status.parity.test.ts`, `README.md`, and `.build/` (28 `*.ps1` provisioning
  scripts + `email-domains.csv`, `optionset-ids.json`, `sources/`, `backups/`). **Delete only after the
  Postgres DDL + the ported parity check are authored from them in P2** ([`20`](./20-data-and-schema-migration.md)).
- `connectors/` — `connectors/location-suggest/` (`apiDefinition.swagger.json` + `apiProperties.json`):
  the custom-connector OpenAPI wrapping the location-suggest Function. Successor = a **direct HTTP call**
  from the new API to the unchanged `functions/location-suggest`. (The **Function stays**; only its
  Power Platform connector wrapper dies.)
- `mockup-app/power.config.json` — the Code App manifest (app id `da7ba7af-…`, connection references,
  `databaseReferences` → `cr1bd_*` entity sets). Pure Code-App binding; deleted as part of P5 when the
  Power Platform deps are stripped. (Listed here for completeness; physically removed in
  [`30`](./30-frontend-preservation.md).)

### Operator / registry / activation docs (pure platform mechanism)
- `DEPLOY-RUNBOOK.md` (root) — `pac code push` deploy sequence.
- `docs/architecture/microsoft-stack.md` · `docs/architecture/live-environment.md` ·
  `docs/architecture/environment.md` (historical) · `docs/architecture/architecture-audit-2026-06-20.md`
  · `docs/architecture/azure-cost-model.md` (models the old mixed PP+Azure cost; successor =
  [`40`](./40-costing-and-servicing.md)).
- `docs/activation/` — all 3: `email-intake-activation.md`, `m1-flow-chain-activation.md`,
  `multi-inbox-activation.md` (operator playbooks for activating flows/connectors).
- `docs/plans/` — **the entire folder**: `README.md`, `milestone-model.md`, `m2-umbrella-...md`,
  `phases-1-7-sweep-report.md`, `user-accounts-and-permissions.md`, every `phase-*/` folder
  (0-foundations … 9-data-governance, ux-design-lab), `runbooks/` (`box-business-test.md`,
  `box-go-live.md`, `dsar-erasure-cross-store.md`, `live-email-linking.md`), `to-integrate-into-phases/`.
  These are the **build-breakdown for the dead platform**; the migration plan set
  (`migration/00`–`99`) is their successor. *(Retain only data files still referenced elsewhere — e.g.
  any `inspection-address-revamp/*.xlsx` corpus source — moving them beside their consumer if needed.)*
- `docs/_audit/` — `FLAGS.md`, `findings.json`, `review-2026-06-22/` (audit of the Power Platform build).
- `docs/research/01-power-platform-native.md` (the PP-native research strand).
- `docs/review-followups-2026-06-19.md` (follow-ups against the old build).

### `.claude/` agent-context (the biggest future-agent pollution risk)
Future agents load this roster; stale Power Platform agents/skills will silently misdirect them.
**DELETE the platform-only ones:**
- `.claude/agents/dataverse-data-architect.md` · `.claude/agents/power-automate-flow-builder.md`.
- `.claude/skills/power-automate-flow/` · `.claude/skills/box-flow-patterns/` (Power Automate Box
  flow fragments) · `.claude/skills/junk-case-cleanup/` (live-Dataverse delete tooling — successor is
  a Postgres equivalent if ever needed, not this).

> The `.claude/` roster also has agents/skills that **survive a rewrite** (Box-as-Azure, the
> Code-App-design agent) — see the REWRITE list. Apply the three-question test to every entry; AGENTS.md
> is the index.

---

## REWRITE clean in place (describe the Azure app — keep the filename)

### Top-level narrative (rewrite EARLY, in P1 — this is risk R6)
- `CLAUDE.md`, `AGENTS.md` — **first.** New stack (SWA + standalone Functions API + Postgres + Durable
  + Graph intake), new agent roster (drop the 2 Power Platform agents; keep azure-integration-engineer,
  document-parser-engineer, eva-sentry-integration; **add a postgres/data-API owner** for the new BFF +
  schema). This is the file every agent loads — get it right before P2–P5 act on it.
- `README.md`, `ROADMAP.md`, `PLAN.md`, `CURRENT_STATUS.md`, `OPEN_ITEMS.md` (root) — re-narrate
  against Azure.
- `docs/README.md` (docs index), `docs/TODOS.md`, `docs/open-questions.md` — re-point at the Azure
  layout; drop dead links to deleted folders.
- `docs/gated.md` — new operator blockers (Entra admin consent for Graph application `Mail.Read`;
  Postgres subscription choice / free-trial→PAYG; EVA + Box creds when those gates flip).
- `docs/roles-and-permissions.md` — Dataverse security roles → **Entra app roles** (the API resolves
  Admin vs User from the token).

### Architecture docs (domain framing survives, mechanism swapped)
- `docs/architecture/data-model.md` → the **Postgres** schema (tables/enums/FKs), preserving the EVA
  integer codes.
- `docs/architecture/integrations.md` → drop the custom-connector framing; describe **direct Function
  HTTP calls** (function key / managed identity).
- `docs/architecture/data-protection.md` → **Postgres + Entra + Blob** residency instead of Dataverse.
- `docs/architecture/repo-constellation.md` → the sibling-repo map minus the Code-App/Dataverse framing.
- `docs/architecture/inspection-address-corpus.md` — light-edit: the `cr1bd_inspectionaddress` corpus
  becomes a Postgres table; the **policy is unchanged** (so this is barely a rewrite — could equally sit
  under KEEP/light-edit).

### `.claude/` roster (decision survives, platform name changes)
- `.claude/agents/box-integration-architect.md` — re-scope from "Box ⇄ Dataverse one-way mirror via
  custom connector" to "Box as an Azure-side archive integration via the `box-webhook` Function"
  (the Function stays). Delete only if the operator drops Box entirely.
- `.claude/agents/fluent-codeapp-designer.md` — the Fluent/React design role survives; the "Code App"
  framing dies. Rewrite to the **SPA-on-SWA** shell (or fold into the design agents).
- `.claude/agents/eva-sentry-integration.md` — light-edit: drop the EVA **custom connector** + the
  Box-Dataverse mention; the EVA Sentry REST contract + image rules are domain and stay.
- `.claude/skills/box-rest-api/` — light-edit: keep the Box REST + **CCG-token-in-Function** pattern
  (survives, used by `box-webhook`); drop the custom-connector OpenAPI contract section.

---

## KEEP (domain / already-Azure — light-edit only where a mechanism is named)
- `CONTEXT.md` (root) — the canonical glossary; no platform coupling; survives unchanged.
- `functions/` (all 6 Function apps) + `ocr/` — unchanged compute.
- `docs/architecture/eva-field-model.md`, `eva-sentry-api.md` — EVA contract; platform-neutral.
- `docs/requirements/` — all 5: `admin-overview.md`, `company-background.md`, `inspection-address.md`,
  `intake-workflow.md`, `provider-corpus.md` (domain; light-edit any flow/Dataverse mention).
- `docs/design/` — `THEME-MAPPING.md`, `ui-ux.md`, `screenshots/` (Fluent/React; platform-neutral).
- `docs/reference/` — the two Sentry API PDFs, `over-length-principal-codes.md`,
  `provider-corpus-status.md` (EVA + provider domain).
- `docs/reviews/` — `190626/` + `README.md`: the **binding manual reviews** are the authoritative
  domain spec; keep, light-edit only where a review line names a dead mechanism (and note ADR-0013
  already superseded the review's "address-match LIVE" line).
- `docs/research/` — `00-strategy.md`, `02-azure-ai-document.md`, `03-domain-workflow.md`,
  `azure-cost-prediction-2026-06-22.md`, `whatsapp-coexistence.md`, `refactor-research/`, `README.md`
  (Azure/domain research; `01-power-platform-native.md` is the only DELETE here).
- `.claude/agents/` survivors: `azure-integration-engineer`, `document-parser-engineer`,
  `accessibility-engineer`, `design-critic`, `mobile-ux-designer`, `motion-demo-designer`,
  `stitch-prototyper`, `ui-ux-pro-max-specialist`, `ui-visual-designer`, `ux-architect`.
- `.claude/skills/` survivors: `eva-sentry-api`, `collision-engineers-design`, `grill-with-docs`,
  `ui-ux-pro-max`.

---

## ADRs (18 total) — keep every number stable
Renumbering breaks inbound references (e.g. ADR-0018 **extends** 0004; ADR-0016 re-affirms 0013); gaps
are harmless. **Walking the real ADR headers shows almost every decision is either pure domain or
already an Azure-Function choice — so, contrary to the blueprint draft, NO ADR is deleted.** In
particular ADR-0004 (parser **as an Azure Function**) and ADR-0006 (enrichment **as a REST-wrapper
Function calling DVSA/DVLA directly**) describe exactly the compute that **stays**, and ADR-0014 is a
domain **case-type** decision, not a Dataverse-column one — none are platform deaths.

- **KEEP as-is (pure domain / already-Azure):** 0001 (repairer entity), 0002 (VRM correlation), 0003
  (channel-aware chasers), 0005 (EVA Sentry full scope), 0007 (manual WhatsApp intake), 0008 (tool
  boundary = EVA handoff), 0011 (provider/intermediary/garage roles), 0018 (vendored parser engine).
- **REWRITE in place (decision survives, mechanism re-expressed; keep number, NO "superseded" note):**
  - 0004 parser-as-Azure-Function — drop the "exposed to the Code App via a custom connector, gated by
    `PDF_MAPPER_ENABLED`" clause; the Function + the `PDF_MAPPER_ENABLED` flag (now an app-setting)
    remain. Decision unchanged.
  - 0006 enrichment REST-wrapper — drop the "→ custom connector" hop; the direct-to-DVSA/DVLA Function
    is the target already.
  - 0009 image AI — drop **AI Builder** (Power Platform) from the M2 line; keep the Azure
    OCR/Foundry-vision phasing.
  - 0010 dedup — re-express the ladder onto Postgres `UNIQUE(sourcemessageid)` + payload-hash; the
    no-time-window **intent** is unchanged.
  - 0012 Box additive one-way mirror — change "Dataverse stays the system of record" → "**Postgres**
    stays the system of record"; Box ops via the `box-webhook` Function (no custom connector). Decision
    (Box as additive archive/intake) survives.
  - 0013 `Loc`/inspection-address — light-edit the `cr1bd_inspectionaddress` corpus to its Postgres
    table; policy (no runtime matcher) unchanged.
  - 0014 audit case-type — drop the "Dataverse / flow / Code App layers planned" implementation note;
    the audit-as-case-type **decision is domain** and stays.
  - 0015 email triage / inbox-management — re-express the deterministic-MVP realisation from a Phase-8
    flow to a Durable orchestration; decision unchanged.
  - 0016 inspection-address corpus regen — corpus table → Postgres; decision unchanged.
  - 0017 data retention / erasure / PII — re-express the lifecycle on Postgres + Blob (and the `pac data
    retention` references → a Postgres job); UK-GDPR decision unchanged.
- **ADD ADR-0019** — one short record: *"Migrated off Power Platform to Azure PaaS (Static Web Apps SPA
  + standalone Flex-Consumption Functions data API + Durable/queue orchestration + Microsoft Graph
  change-notification intake + Postgres Flexible Server)."* with the why (SWA managed Functions too
  constrained; Sentry single-principal; cost). This is the **only** permitted "we used to be Power
  Platform" trace — one forward-looking decision record, not a legacy archive.

---

## Final gate → then delete `migration/`
When P9 is done, the grep gate in [`99`](./99-verification-and-cutover.md) must show **no working-tree
file references Dataverse / Power Automate / `pac` / Code App / `cr1bd_` outside `migration/` itself**
(ADR-0019's single migration sentence is the only permitted mention). Once green, **delete the
`migration/` folder** — its job is finished and it must not become permanent docs.
