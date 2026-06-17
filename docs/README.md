# Documentation Index

Documentation for **collisionspike** — a fast Power Platform spike of the Collision Engineers
case-intake workflow. See the root [README](../README.md) and [PLAN.md](../PLAN.md) for the
implementation plan.

## Requirements
- [admin-overview.md](./requirements/admin-overview.md) — how the manual process works today.
- [intake-workflow.md](./requirements/intake-workflow.md) — the target 10-step automated pipeline
  and additional requirements.
- [provider-corpus.md](./requirements/provider-corpus.md) — governed provider/garage corpus,
  Provider Automation Mode, two-tier kill switches, provenance & improvement loop.
- [inspection-address.md](./requirements/inspection-address.md) — inspection-address policy model
  and ranked-candidate assistant (Microsoft-mapped).
- [company-background.md](./requirements/company-background.md) — who Collision Engineers are and
  the domain terminology.

## Architecture
- [microsoft-stack.md](./architecture/microsoft-stack.md) — **the recommended Microsoft stack**
  (service per requirement, costing, Learn citations).
- [data-model.md](./architecture/data-model.md) — **Dataverse tables** distilled from the job sheet,
  corpus, and case workflow (Case, WorkProvider, InspectionAddress, Evidence, Audit, provenance).
- [eva-sentry-api.md](./architecture/eva-sentry-api.md) — authoritative EVA "Sentry" API v1.2
  endpoints & auth (from the PDF in `raw/`).
- [repo-constellation.md](./architecture/repo-constellation.md) — the sibling repos (ideas/prior-art,
  none canonical) and reusable patterns.
- [integrations.md](./architecture/integrations.md) — EVA, enrichment connectors, parser, address,
  Box, and the feature-flag (environment-variable) gating model.
- [environment.md](./architecture/environment.md) — **discovered build environment** (Power Platform
  ready; **no Azure subscription**; Infisical secrets; EVA test creds) and the wrapper-hosting decision.

## Distilling `raw/`
`raw/` (gitignored — contains PII) is a drop-zone for source material. Examined and distilled into
the docs above: the CE Job Sheet → [data-model.md](./architecture/data-model.md); the
provider/inspection-address corpus notes → [provider-corpus.md](./requirements/provider-corpus.md)
and [inspection-address.md](./requirements/inspection-address.md); the Sentry API PDF →
[eva-sentry-api.md](./architecture/eva-sentry-api.md).

## Reference
- `reference/` — pointers to sibling repos and external specs (kept here as they accrue).
