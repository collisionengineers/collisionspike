# Documentation Index

Documentation for **collisionspike** — a fast Azure-PaaS spike (migrated off Power Platform 2026-06-27)
of the Collision Engineers case-intake workflow.

**Start with the root docs:** [../README.md](../README.md) (overview) · [../ROADMAP.md](../ROADMAP.md)
(forward worklist — the merged backlog) · [../CURRENT_STATUS.md](../CURRENT_STATUS.md) (what's live now) ·
[gated.md](./gated.md) (what needs the operator) · [../AGENTS.md](../AGENTS.md) (operating rules) ·
**the live registry — authoritative numbers:** [../LIVE_FACTS.json](../LIVE_FACTS.json) +
[architecture/live-environment.md](./architecture/live-environment.md). Live deploy procedure is the Azure
playbooks under [azure/README.md](./azure/README.md). _Historical:_ [PLAN.md](./HISTORICAL/PLAN.md)
(narrative plan) · [DEPLOY-RUNBOOK.md](./HISTORICAL/DEPLOY-RUNBOOK.md) (Power-Platform-era deploy).

> **Precedence.** A dated **binding review** in [reviews/](./reviews/) outranks everything older
> (docs, plans, ADRs, code) for the areas it covers; then **ADRs** ([adr/](./adr/)); then the
> **architecture/requirements** specs below; then **plans**. Canonical phase taxonomy = ROADMAP
> **Phase 0–6**.

## Requirements — the business problem
> Index: [requirements/README.md](./requirements/README.md).
- [requirements/admin-overview.md](./requirements/admin-overview.md) — how the manual process works today.
- [requirements/intake-workflow.md](./requirements/intake-workflow.md) — the target 10-step automated pipeline.
- [requirements/provider-corpus.md](./requirements/provider-corpus.md) — governed provider/garage corpus, automation modes, kill switches, provenance.
- [requirements/inspection-address.md](./requirements/inspection-address.md) — inspection-address policy model + ranked-candidate assistant.
- [requirements/company-background.md](./requirements/company-background.md) — who Collision Engineers are + domain terminology.

## Architecture — how it's built
> Index: [architecture/README.md](./architecture/README.md).
- [architecture/microsoft-stack.md](./architecture/microsoft-stack.md) — the recommended Microsoft stack (service per requirement, costing, Learn citations).
- [architecture/data-model.md](./architecture/data-model.md) — Postgres tables (was Dataverse) + the status state machine.
- [architecture/eva-field-model.md](./architecture/eva-field-model.md) — the EVA 12-field contract + mappings + the enrichment/AI status checks.
- [architecture/eva-sentry-api.md](./architecture/eva-sentry-api.md) — authoritative EVA "Sentry" API v1.2 endpoints & auth (from the PDF in `raw/`).
- [architecture/integrations.md](./architecture/integrations.md) — EVA, enrichment (DVSA/DVLA), parser, address (postcode.io), Box, and the feature-flag gating model.
- [architecture/vehicle-data.md](./architecture/vehicle-data.md) — the one vehicle-data service contract, immutable MOT evidence and displayed-mileage estimator.
- [architecture/live-environment.md](./architecture/live-environment.md) — **canonical live registry — mirrors [`LIVE_FACTS.json`](../LIVE_FACTS.json)** (live Azure resource IDs, counts, connectors). The single source for live numbers.
- [architecture/repo-constellation.md](./architecture/repo-constellation.md) — the sibling repos (ideas/prior-art only, none canonical).
- [architecture/environment.md](./architecture/environment.md) — _historical_ build-environment notes (superseded by `live-environment.md`; kept for context).

## Tickets — atomic work items
- [tickets/README.md](./tickets/README.md) — the **Markdown ticket system**: one `.md` per work item
  (YAML frontmatter: `id`/`title`/`status`/`priority`/`area`/`tickets-it-relates-to`/`research-link`),
  tracked on [tickets/BOARD.md](./tickets/BOARD.md) (Now / Next / Backlog / Done). The granular layer
  under `ROADMAP.md`; distilled from the [work-todo-spike](./plans/work-todo-spike/) research drop-zone.
  Validated by `node scripts/check-tickets.mjs`.

## Plans — what to build, by phase
- [plans/README.md](./plans/README.md) — the plans index. One folder per ROADMAP phase, each with an
  ordered build checklist; feature subfolders inside larger phases. The cross-phase M2 umbrella is
  [plans/m2-umbrella-enrichment-to-scale.md](./plans/m2-umbrella-enrichment-to-scale.md).
  - **Ticket-source drop-zone:** [plans/work-todo-spike/](./plans/work-todo-spike/) holds the operator
    stubs, fan-out **research packs**, and sample data behind the [tickets/](./tickets/README.md) — retained
    (other agents consume the fixtures); index + done map in
    [plans/work-todo-spike/README.md](./plans/work-todo-spike/README.md), **not** authoritative on live state.

## Operator & status
- [../ROADMAP.md](../ROADMAP.md) — the forward worklist; tickets carry the atomic work items beneath it.
- [gated.md](./gated.md) — the consolidated **hard/soft blocker** registry (everything that needs the operator).
- [not-yet-live-inventory.md](./not-yet-live-inventory.md) — the full map of what's not fully live: operator-blocked (indexes gated.md), feature-gated-off, on-but-stubbed code, planned-not-implemented, Proposed ADRs, and deliberately-deferred-by-design items.
- [roles-and-permissions.md](./roles-and-permissions.md) — **gap analysis**: the roles `digital@` does NOT have but NEEDS (Box Business+admin, Exchange Admin, Key Vault Secrets Officer, Power Platform Admin, License Admin) — vs. what Owner + Dataverse System Admin already cover.
- [reviews/README.md](./reviews/README.md) — binding manual-review workflow and follow-ups.

## Operator handoff
- [handoff/README.md](./handoff/README.md) — the 2026-06-27 operator handoff pack. Start with
  [handoff/OPERATOR-CHECKLIST.md](./handoff/OPERATOR-CHECKLIST.md) (the ordered operator actions — #1 = the
  Exchange-RBAC mailbox grant).

## Historical
- [HISTORICAL/README.md](./HISTORICAL/README.md) — decommissioned/superseded material kept for provenance:
  [PLAN.md](./HISTORICAL/PLAN.md), [DEPLOY-RUNBOOK.md](./HISTORICAL/DEPLOY-RUNBOOK.md),
  [box-integration-pivot/](./HISTORICAL/box-integration-pivot/), [migration/](./HISTORICAL/migration/) (the
  executed PP→Azure cutover; the live Postgres DDL stays at the repo-root `migration/assets/`).

## Audit
- [_audit/README.md](./_audit/README.md) — point-in-time audit artefacts (FLAGS, findings, dated reviews, this
  2026-06-28 repo-hygiene pass). Not living docs.

## Maintenance
- [MAINTENANCE.md](./MAINTENANCE.md) — the doc-freshness contract: the verify-live gate, the link-checker,
  and how to keep the registry (`LIVE_FACTS.json` / `live-environment.md`) the single source for live numbers.

## Reviews — binding manual reviews
- [reviews/README.md](./reviews/README.md) — the binding-review convention (dated `reviews/<DDMMYY>/` folders are authoritative, superseded only by a later review).
- [reviews/190626/](./reviews/190626/) — the 2026-06-19 UI/UX review (8 tasks, actioned).
- [reviews/010726/](./reviews/010726/) — the 2026-07-01 UI/UX **reforge decision register** (red budget, semantic colours, queues/bulk/drawer rulings; shipped same day).

## Design
> Index: [design/README.md](./design/README.md).
- [design/ui-ux.md](./design/ui-ux.md) — M1 UI/UX design spec (IA, four-screen flow, status machine, Fluent v9 tokens).
- [design/THEME-MAPPING.md](./design/THEME-MAPPING.md) — CE → Fluent v9 token table. `design/screenshots/` — versioned visual history.

## Research — forward-looking lanes
- [research/README.md](./research/README.md) — four research lanes (strategy, Power Platform native, Azure AI/document, domain workflow); top picks + anti-features.

## Activation playbooks (operator)
> Index: [activation/README.md](./activation/README.md). _(These describe the prior `digital@`/V3-trigger path; live intake is the Azure **Graph PUSH** change-notification / Exchange-RBAC path — see [azure/entra-graph.md](./azure/entra-graph.md).)_
- [activation/email-intake-activation.md](./activation/email-intake-activation.md) · [activation/m1-flow-chain-activation.md](./activation/m1-flow-chain-activation.md) · [activation/multi-inbox-activation.md](./activation/multi-inbox-activation.md)

## Azure operations (runbooks)
- [azure/README.md](./azure/README.md) — **the Azure task router**: match a task → the skill/tool/agent to
  invoke (diagnose · logs-KQL · deploy · identity-RBAC · secrets-Key Vault · entra-Graph · postgres), plus
  the **anti-churn doctrine**. Each playbook references [architecture/live-environment.md](./architecture/live-environment.md)
  + `memory/azure-*` rather than duplicating them. Mirrors the routing table in [CLAUDE.md](../CLAUDE.md);
  enforced by the `azure-route-guard` / `azure-churn-guard` hooks.

## ADRs
> Index: [adr/README.md](./adr/README.md).
- [adr/](./adr/) — architecture decision records **0001–0018** (**0015 & 0017 _Proposed_**; the rest Accepted) — entities, dedup, chasers, parser, EVA, enrichment, WhatsApp, tool boundary, image AI, sourcing roles, **Box-centric intake additive hybrid**, `Loc`-export-artifact, audit case-type, email-triage, inspection-address corpus, retention/PII lifecycle, the vendored-parser boundary.

## Reference
> Index: [reference/README.md](./reference/README.md).
- [reference/](./reference/) — EVA Sentry API PDFs (v1.2 current) + the over-length-principal-codes note + a superseded provider-corpus snapshot.

## Distilling `raw/`
`raw/` (gitignored — contains PII) is a drop-zone for source material, distilled into the docs above:
the CE Job Sheet → [architecture/data-model.md](./architecture/data-model.md); the provider/address
corpus → [requirements/provider-corpus.md](./requirements/provider-corpus.md) +
[requirements/inspection-address.md](./requirements/inspection-address.md) (full analysis under
`raw/principalandrepairersheets/outputs/`); the Sentry API PDF →
[architecture/eva-sentry-api.md](./architecture/eva-sentry-api.md).
