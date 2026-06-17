# collisionspike

A fast, early **spike** of the Collision Engineers case-intake workflow, built on the **Microsoft
Power Platform** (Power Apps **Code App** + Dataverse + Power Automate). It prototypes the
intake → parse → review → enrich → **EVA** + **Box** pipeline cheaply, to validate the workflow
and de-risk the mature cloud build (`collisioncc`, which is on Google Cloud).

> **Status:** the **M1 vertical slice is built offline** (`[BUILD]`) — the Code App data layer +
> screens, the shared EVA/status/image contracts, the Dataverse schema-as-code, two Azure Functions
> (parser + DVSA enrichment), the 10 Power Automate flow definitions (shipping OFF), and the
> `power-automate-flow` skill. Nothing live has been touched — deploying non-inbox resources and
> activating anything inbox/SharePoint/Box/EVA are reserved for the operator (see
> [DEPLOY-RUNBOOK.md](./DEPLOY-RUNBOOK.md)). Run `node verify-all.mjs` for the offline gate.

## What it does (target)

Monitor three Outlook shared inboxes → parse instruction documents (PDF/DOC/DOCX/MSG/EML) and
classify images → tag the email → surface a **Case** for human review → when required fields and
images are present, export to **EVA** and archive to **Box** → chase missing info otherwise → audit
and de-duplicate every action. Full pipeline: [docs/requirements/intake-workflow.md](./docs/requirements/intake-workflow.md).

## Start here

- **Plan:** [PLAN.md](./PLAN.md) — phased implementation.
- **Microsoft stack:** [docs/architecture/microsoft-stack.md](./docs/architecture/microsoft-stack.md) — the recommended services, costing, and citations.
- **Ecosystem:** [docs/architecture/repo-constellation.md](./docs/architecture/repo-constellation.md) — how this repo relates to `ccc`, `collisioncc`, `collisionplugin`, and `cedocumentmapper_v2.0`.
- **Docs index:** [docs/README.md](./docs/README.md).
- **Agent guidance:** [CLAUDE.md](./CLAUDE.md).

## Phase 1 build (M1) — what's in the repo now

Built and offline-verifiable: `node verify-all.mjs` → 6 gates (Code App build + 192 tests, Dataverse
parity, flow linter, parser + enrichment pytest).

- **Plan:** [plans/phase-1-intake-and-case-tracking-implementation.md](./plans/phase-1-intake-and-case-tracking-implementation.md) · **Deploy:** [DEPLOY-RUNBOOK.md](./DEPLOY-RUNBOOK.md) (the `[DEPLOY-WITH-LOGIN]` / `[RESERVED-FOR-USER]` sequence + blockers).
- `mockup-app/` — the Code App (React + Fluent v9): `src/contracts/` (EVA/status/image), `src/domain/` (classification, ADR-0010 dedup, provider-match, address-policy), `src/data/` (the mock↔Dataverse seam), screens.
- `dataverse/` — schema-as-code (10 tables + provenance, choice sets, env-vars, relationships).
- `functions/{parser,enrichment}/` — Azure Functions (code, Bicep, OpenAPI, mocked pytest).
- `flows/` — the 10 Power Automate flow definitions (`state=off`) + offline linter.
- `.claude/skills/power-automate-flow/` — reusable flow-authoring patterns.

## Relationship to the other repos

`collisionspike` is the build target. **`collisioncc`, `ccc`, `collisionplugin`, and
`cedocumentmapper(_v2.0)` are reference / background / context** — see the
[constellation map](./docs/architecture/repo-constellation.md). Do not modify sibling repos from here.

## Tooling

- **Power Platform CLI** (`pac`) installed — `pac code init` / `add-data-source` / `run` / `push`.
- Node.js + .NET present. Git initialised (`main`).
