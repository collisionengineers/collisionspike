# collisionspike

A fast, early **spike** of the Collision Engineers case-intake workflow, built on the **Microsoft
Power Platform** (Power Apps **Code App** + Dataverse + Power Automate). It prototypes the
intake → parse → review → enrich → **EVA** + **Box** pipeline cheaply, to validate the workflow
and de-risk the mature cloud build (`collisioncc`, which is on Google Cloud).

> **Status:** planning & documentation. No application code yet — the Power Apps Code App is
> scaffolded later with `pac code init` (the Power Platform CLI is installed). This repo currently
> holds the requirements, the Microsoft-stack research, and the plan.

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

## Relationship to the other repos

`collisionspike` is the build target. **`collisioncc`, `ccc`, `collisionplugin`, and
`cedocumentmapper(_v2.0)` are reference / background / context** — see the
[constellation map](./docs/architecture/repo-constellation.md). Do not modify sibling repos from here.

## Tooling

- **Power Platform CLI** (`pac`) installed — `pac code init` / `add-data-source` / `run` / `push`.
- Node.js + .NET present. Git initialised (`main`).
