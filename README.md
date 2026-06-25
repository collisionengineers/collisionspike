# collisionspike

A fast, early **spike** of the Collision Engineers case-intake workflow, built on the **Microsoft
Power Platform** (Power Apps **Code App** + Dataverse + Power Automate). It prototypes the
intake → parse → review → enrich → **EVA** + **Box** pipeline cheaply, to validate the workflow
and de-risk the mature cloud build (`collisioncc`, which is on Google Cloud).

> **Status (2026-06-22):** the M1 slice is built **and much is now deployed to a dedicated Sandbox** —
> the **parser Function is live** (FC1, real extraction), the **Dataverse schema + provider corpus** are
> built/seeded, the **Code App is live** (manual intake works; logo/fonts/nav fixed), and the **enrichment
> Function is deployed and live (`ENRICHMENT_ENABLED=true` in Dev)** (direct DVSA/DVLA — the Google Cloud gateway was retired). The 15 flow definitions
> are imported **OFF** except the Claude-wired `case-resolve` merge-by-registration flow. Still operator-gated: **live email intake** and **EVA/Box**
> (the live-services boundary). **No mock data** — the app shows real Dataverse rows only.
> **Phase 7 (the Box-centric intake pivot — [ADR-0012](./docs/adr/0012-box-centric-intake-additive-hybrid.md))**
> has its **Dataverse schema + env-vars applied live (all `BOX_*` gates `false`)**, with the `box-webhook`
> Function **deployed to Azure (`cespkbox-fn-v76a47`) and Gate-C-verified but gated OFF and secret-free**, while the
> `cr1bd_box_rest` connector and the Box flows remain **authored offline (not imported/bound)**:
> a per-Case/PO Box folder at parse-confirm + File-Request image chasers + a webhook that advances the case,
> as a **one-way Box mirror with Dataverse authoritative**; evidence is **linked, not embedded** (a
> server-minted "Open in Box" deep link — no iframe/`frame-src` edit). The always-on Box-account integration
> (CCG + `FILE.UPLOADED` webhook + template File Request) is deferred to a future **Business-account** phase
> (base Box Business is the floor; Business Plus is only for the optional metadata tier).
> **→ See [CURRENT_STATUS.md](./CURRENT_STATUS.md) (where we are) and [ROADMAP.md](./ROADMAP.md) (the checklist).**
> Run `node verify-all.mjs` for the offline gate; deploy/activation sequence in [DEPLOY-RUNBOOK.md](./DEPLOY-RUNBOOK.md).

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

Built and offline-verifiable: `node verify-all.mjs` → **all gates green** (Code App build + tests, Dataverse
parity, flow linter, a pytest loop over every built Function suite, the generated-service
no-`uploadFileToRecord` guard, and the boundary grep-gate). It began at 7 gates and has since widened — use
"all gates green", not a pinned count; the live breakdown is in CURRENT_STATUS / OPEN_ITEMS.

- **Plan:** [docs/plans/phase-1-intake-and-case-tracking/phase-1-intake-and-case-tracking-implementation.md](./docs/plans/phase-1-intake-and-case-tracking/phase-1-intake-and-case-tracking-implementation.md) · **Deploy:** [DEPLOY-RUNBOOK.md](./DEPLOY-RUNBOOK.md) (the `[DEPLOY-WITH-LOGIN]` / `[RESERVED-FOR-USER]` sequence + blockers).
- `mockup-app/` — the Code App (React + Fluent v9): `src/contracts/` (EVA/status/image), `src/domain/` (classification, ADR-0010 dedup, provider-match, address-policy), `src/data/` (the mock↔Dataverse seam), screens.
- `dataverse/` — schema-as-code (10 tables + provenance, choice sets, env-vars, relationships).
- `functions/` — Azure Functions (`parser`, `enrichment`, `evasentry`, `evavalidation`, `box-webhook`; code, Bicep, OpenAPI, mocked pytest).
- `flows/` — the 15 Power Automate flow definitions (`state=off` except the Claude-wired `case-resolve`) + offline linter (154/154).
- `.claude/skills/power-automate-flow/` — reusable flow-authoring patterns.

## Relationship to the other repos

`collisionspike` is the build target. **`collisioncc`, `ccc`, `collisionplugin`, and
`cedocumentmapper(_v2.0)` are reference / background / context** — see the
[constellation map](./docs/architecture/repo-constellation.md). Do not modify sibling repos from here.

## Tooling

- **Power Platform CLI** (`pac`) installed — `pac code init` / `add-data-source` / `run` / `push`.
- Node.js + .NET present. Git initialised (`main`).
