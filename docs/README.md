# Documentation Index

Documentation for **collisionspike** — a fast Power Platform spike of the Collision Engineers
case-intake workflow.

**Start with the root docs:** [../README.md](../README.md) (overview) · [../PLAN.md](../PLAN.md)
(narrative plan) · [../ROADMAP.md](../ROADMAP.md) (phased checklist) ·
[../CURRENT_STATUS.md](../CURRENT_STATUS.md) (what's live now) ·
[../DEPLOY-RUNBOOK.md](../DEPLOY-RUNBOOK.md) (deploy sequence) · [gated.md](./gated.md) (what needs the
operator) · [../AGENTS.md](../AGENTS.md) (operating rules).

> **Precedence.** A dated **binding review** in [reviews/](./reviews/) outranks everything older
> (docs, plans, ADRs, code) for the areas it covers; then **ADRs** ([adr/](./adr/)); then the
> **architecture/requirements** specs below; then **plans**. Canonical phase taxonomy = ROADMAP
> **Phase 0–6**.

## Requirements — the business problem
- [requirements/admin-overview.md](./requirements/admin-overview.md) — how the manual process works today.
- [requirements/intake-workflow.md](./requirements/intake-workflow.md) — the target 10-step automated pipeline.
- [requirements/provider-corpus.md](./requirements/provider-corpus.md) — governed provider/garage corpus, automation modes, kill switches, provenance.
- [requirements/inspection-address.md](./requirements/inspection-address.md) — inspection-address policy model + ranked-candidate assistant.
- [requirements/company-background.md](./requirements/company-background.md) — who Collision Engineers are + domain terminology.

## Architecture — how it's built
- [architecture/microsoft-stack.md](./architecture/microsoft-stack.md) — the recommended Microsoft stack (service per requirement, costing, Learn citations).
- [architecture/data-model.md](./architecture/data-model.md) — Dataverse tables + the status state machine.
- [architecture/eva-field-model.md](./architecture/eva-field-model.md) — the EVA 12-field contract + mappings + the enrichment/AI status checks.
- [architecture/eva-sentry-api.md](./architecture/eva-sentry-api.md) — authoritative EVA "Sentry" API v1.2 endpoints & auth (from the PDF in `raw/`).
- [architecture/integrations.md](./architecture/integrations.md) — EVA, enrichment (DVSA/DVLA), parser, address (postcode.io), Box, and the feature-flag gating model.
- [architecture/live-environment.md](./architecture/live-environment.md) — **canonical registry** of the live Sandbox env IDs, Azure resources, connectors, flows (verified 2026-06-19).
- [architecture/repo-constellation.md](./architecture/repo-constellation.md) — the sibling repos (ideas/prior-art only, none canonical).
- [architecture/environment.md](./architecture/environment.md) — _historical_ build-environment notes (superseded by `live-environment.md`; kept for context).

## Plans — what to build, by phase
- [plans/README.md](./plans/README.md) — the plans index. One folder per ROADMAP phase, each with an
  ordered build checklist; feature subfolders inside larger phases. The cross-phase M2 umbrella is
  [plans/m2-umbrella-enrichment-to-scale.md](./plans/m2-umbrella-enrichment-to-scale.md).

## Operator & status
- [gated.md](./gated.md) — the consolidated **hard/soft blocker** registry (everything that needs the operator).
- [roles-and-permissions.md](./roles-and-permissions.md) — **gap analysis**: the roles `digital@` does NOT have but NEEDS (Box Business+admin, Exchange Admin, Key Vault Secrets Officer, Power Platform Admin, License Admin) — vs. what Owner + Dataverse System Admin already cover.
- [review-followups-2026-06-19.md](./review-followups-2026-06-19.md) — verified architecture-review follow-ups.

## Reviews — binding manual reviews
- [reviews/README.md](./reviews/README.md) — the binding-review convention (dated `reviews/<DDMMYY>/` folders are authoritative, superseded only by a later review).
- [reviews/190626/](./reviews/190626/) — the 2026-06-19 UI/UX review (8 tasks, actioned).

## Design
- [design/ui-ux.md](./design/ui-ux.md) — M1 UI/UX design spec (IA, four-screen flow, status machine, Fluent v9 tokens).
- [design/THEME-MAPPING.md](./design/THEME-MAPPING.md) — CE → Fluent v9 token table. `design/screenshots/` — versioned visual history.

## Research — forward-looking lanes
- [research/README.md](./research/README.md) — four research lanes (strategy, Power Platform native, Azure AI/document, domain workflow); top picks + anti-features.

## Activation playbooks (operator)
- [activation/email-intake-activation.md](./activation/email-intake-activation.md) · [activation/m1-flow-chain-activation.md](./activation/m1-flow-chain-activation.md) · [activation/multi-inbox-activation.md](./activation/multi-inbox-activation.md)

## ADRs
- [adr/](./adr/) — architecture decision records **0001–0012** (entities, dedup, chasers, parser, EVA, enrichment, WhatsApp, tool boundary, image AI, sourcing roles, **Box-centric intake additive hybrid**).

## Reference
- [reference/](./reference/) — EVA Sentry API PDFs (v1.2 current) + a superseded provider-corpus snapshot.

## Distilling `raw/`
`raw/` (gitignored — contains PII) is a drop-zone for source material, distilled into the docs above:
the CE Job Sheet → [architecture/data-model.md](./architecture/data-model.md); the provider/address
corpus → [requirements/provider-corpus.md](./requirements/provider-corpus.md) +
[requirements/inspection-address.md](./requirements/inspection-address.md) (full analysis under
`raw/principalandrepairersheets/outputs/`); the Sentry API PDF →
[architecture/eva-sentry-api.md](./architecture/eva-sentry-api.md).
