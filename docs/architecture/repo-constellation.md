# Repository Constellation

The Collision Engineers rebuild spans several projects, now organised under `collisionsuite/`
(reorganised 2026-06-23 — see [INDEX.md](../../../../INDEX.md); note `collisionplugin` was
dissolved into `collisionsuite/skills/` + `collisionsuite/connectors/`). **`collisionspike` (this
repo, at `active/collisionspike/`) is an early, fast spike** of the case-intake workflow — built on
**Azure PaaS** (migrated off the original Microsoft Power Platform implementation on 2026-06-27; the
live registry is [live-environment.md](./live-environment.md)).

> **None of the adjacent repos are canonical.** They are repos containing **ideas, prior art, and
> references** to Collision Engineers' processes and possible workflows — useful to mine and adapt,
> not authoritative specs. The spike's own distilled docs (this folder + `docs/requirements/`) plus
> the `raw/` source material are the working source of truth. Do not modify sibling repos from here.

> **Coupling model — no package imports across repos.** Each leaf in `collisionsuite/` is an
> **independent git repo**; collisionspike does **not** depend on any sibling as a package or pull one
> in at runtime. The couplings are: (1) the **parser engine** from `cedocumentmapper_v2.0` is
> **vendored** — a build-time copy snapshotted into `functions/parser/cedocumentmapper_v2/`, never a
> live import of the sibling (ADR-0004/0018); (2) **enrichment** reaches DVSA/DVLA **directly** over
> Entra `client_credentials` (the MCP connectors under `connectors/` are prior-art/fallback, not in
> the live path); and (3) everything else (`ccc`, `collisioncc`, …) is **reference/documentation**
> only — re-implement their contracts, do not call them.

## Map

| Repo | What it is | Stack | Role for the spike |
|---|---|---|---|
| **collisionspike** (this) | Fast spike of the intake→EVA workflow | **Azure PaaS** — React/Vite SPA (Static Web App) + Data API & orchestration Function Apps + Postgres _(migrated off Power Platform 2026-06-27)_ | **Build target** |
| **ccc** | Planning, ideas & draft contracts for the wider programme ("Collision Command Centre"); Python parser core, skills library, ADRs | Python (parser core); UI/DB undecided | **Ideas / prior art** — mine its draft contracts, adapt; not authoritative |
| **collisioncc** | **Mature reference build** of the product on Google Cloud; Graph email intake, parser + Google Document AI, EVA Sentry submit, image-rules, case-status, **pricing guide** | Next.js + Firebase / Google Cloud (deploys as `ccc-web`) | **Reference/context only** — re-implement its contracts; do not call at runtime |
| **collisionplugin** _(dissolved 2026-06-23 → `connectors/` + `skills/`)_ | Was a Claude plugin + **MCP enrichment connectors** on Cloud Run, behind an OAuth gateway *(prior art — M1 uses direct Entra auth to DVSA/DVLA, no gateway hop)* | Node/TS + Python (FastMCP), Cloud Run `europe-west2` | **Prior-art / fallback** (M1 enrichment goes direct; valuation wrapper may revisit later) |
| **cedocumentmapper** | Legacy v1 document parser — 4,244-line Tkinter monolith, no tests/VCS | Python + Tkinter + Tesseract | Behaviour reference only |
| **cedocumentmapper_v2.0** | Contract-first parser engine; **authoring source of truth** for the engine that is **vendored + live** in this repo | Python library + CLI | **Engine authoring repo** — edit here, then re-vendor into `functions/parser/` |
| collisionpdf, collisionautomation, archive/dvlaclaudeconnector, archive/valuationbot(*) | Parser-first FastAPI service; React/Vite UI prototype; DVLA connector (now `connectors/dvla-dvsa-connector`); valuation prototypes (now `connectors/valuation-adverts-connector`) | mixed | Secondary references |

## Reusable ideas / prior art (adapt — not authoritative)

These collisioncc/ccc patterns are good starting points the spike adapts (they are references, not
binding contracts). The distilled, binding design lives in
[data-model.md](./data-model.md), [eva-sentry-api.md](./eva-sentry-api.md),
[../requirements/provider-corpus.md](../requirements/provider-corpus.md), and
[../requirements/inspection-address.md](../requirements/inspection-address.md).

- **Case status** state machine (`collisioncc/src/lib/case-status.ts`):
  `new_email → ingested → needs_review → ready_for_eva → eva_submitted`, plus branches
  `missing_required_fields`, `missing_images`, `duplicate_risk`; terminals `eva_submitted`,
  `linked_to_instruction`, `box_synced`, `error`.
- **Image rules** (`collisioncc/src/lib/image-rules.ts`): ≥2 EVA-accepted images, including one
  **overview** (registration visible) and one **damage_closeup**; roles
  `overview | damage_closeup | additional | unknown`.
- **EVA export** (12-field JSON, 6-line inspection address) — see [integrations.md](./integrations.md).
- **Work-item / evidence-package / provider-principal-config** contracts in `ccc/docs/contracts/`.

## cedocumentmapper_v2.0

A clean, layered, contract-first parser engine (~5,100 LOC, Python 3.11+): domain models; readers
(PDF/DOCX/DOC/EML/MSG); provider detection (required/optional/negative phrase matching); **12-kind
rule engine**; field normalisers (VRM, date, 6-line address, VAT, mileage); **schema-validated
EVA-JSON exporter**; v1→v2 config migration; a CLI; and a pytest suite.

It is a **standalone dual-target product** (see [ADR-0018](../adr/0018-cedocumentmapper-dual-target-vendored-engine.md)):
a single-user **desktop review GUI** (React/Vite `frontend/` + a `pywebview` host, portable PyInstaller exe via
`build.ps1`) **and** the headless **engine-core** packaged for the **cloud** (vendored into our parser Function).
Since 2026-06-23 it also carries an opt-in **extraction orchestrator**, **offline LLM-assist** (review-only),
and an **eval harness** — all **desktop/dev-only and deliberately NOT vendored** onto the cloud path.

- **Integrated + guarded.** The engine is **vendored into `functions/parser/cedocumentmapper_v2/`**
  and **deployed live** as the parser Azure Function (short name `cespike-parser-dev`, route
  `/api/parse`), called over HTTP by the Data API + orchestration apps — identities in the registry
  [live-environment.md](./live-environment.md). _(The prior Power Platform `cr1bd_ceparser` custom
  connector is decommissioned.)_ Reuse the engine; do not re-derive parsing in the API/SPA.
- **Authoring rule (single direction).** This sibling repo is the **authoring source of truth** for
  the engine. `functions/parser/cedocumentmapper_v2/` is a **pinned vendored copy** re-cut by the
  documented command in `functions/parser/cedocumentmapper_v2/PROVENANCE.md`. **All engine edits land
  in the sibling first** and are then re-vendored — the vendored copy is **never hand-edited** except
  for two recorded reconciliations (vendored-only ROADMAP-B2 claimant contact extraction; sibling-only
  engineer-report overlay/notes), with the "Image Based Assessment" normalisation converged in both.
  `functions/parser/tests/test_engine_vendored_in_sync.py` is a drift guard that fails on divergence
  (and skips when the sibling is unreachable).
  - **⚠ Open reconciliation item — vendored copy is BEHIND the sibling.** A parser fix has landed in
    the `cedocumentmapper_v2.0` engine-core that has **not yet been re-vendored** here, so the copy
    has diverged from its source. Re-vendor per the procedure in
    [`PROVENANCE.md`](../../functions/parser/cedocumentmapper_v2/PROVENANCE.md) (see its **OPEN** banner)
    against the latest committed sibling ref, then confirm the drift guard is green. Note the sibling
    is **not currently checked out** in this workspace, so the drift guard **skips** rather than
    failing — the divergence will not be caught locally until the sibling is cloned (SETUP.md).
- **Contract fidelity.** The vendored engineer-report overlay adds a top-level `notes` (session
  provenance) to `record_to_dict`; it is **not** an EVA field and never reaches the 12-field EVA
  payload (the adapter builds the payload solely from `EVA_FIELD_ORDER` over `fields`, like
  `inspection_date` is dropped). Locked by `tests/test_parse.py`.
- **Omissions (the boundary).** Only the **engine-core** is vendored. The **product surface** stays
  sibling-only and never reaches the FC1 worker: `cli.py`, `__main__.py`, `ui/host.py`, `frontend/`,
  `build.ps1`, and the newer **`extraction/` (orchestrator)**, **`eval/` (harness)**, **LLM-assist**, and
  `resources/`. The deployed Function is the **deterministic rule engine** only (`ui/paths.py` is vendored
  for path helpers). The standalone CLI + desktop GUI remain in the sibling for local/offline use.
- **Licensing:** depends on **PyMuPDF (AGPL)** — concern **resolved (licensed); no blocker** for
  closed-source distribution.
