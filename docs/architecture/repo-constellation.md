# Repository Constellation

The Collision Engineers rebuild spans several sibling repositories under
`C:\Users\Alex\Documents\GitHub\`. **`collisionspike` (this repo) is an early, fast Power
Platform spike** of the case-intake workflow. The others are **reference / background / context**
— do not modify them from here.

## Map

| Repo | What it is | Stack | Role for the spike |
|---|---|---|---|
| **collisionspike** (this) | Fast Power Platform spike of the intake→EVA workflow | Power Apps **Code App** (React/Vite) + Dataverse + Power Automate | **Build target** |
| **ccc** | Canonical **planning & contracts** repo for the whole programme ("Collision Command Centre"); Python parser core, skills library, ADRs | Python (parser core); UI/DB undecided | **Contract source** — align the spike's data model & EVA output to its contracts |
| **collisioncc** | **Mature reference build** of the product on Google Cloud; Graph email intake, parser + Google Document AI, EVA Sentry submit, image-rules, case-status, **pricing guide** | Next.js + Firebase / Google Cloud (deploys as `ccc-web`) | **Reference/context only** — re-implement its contracts; do not call at runtime |
| **collisionplugin** | Claude plugin + **MCP enrichment connectors** on Cloud Run, behind an OAuth gateway | Node/TS + Python (FastMCP), Cloud Run `europe-west2` | **Runtime enrichment** (mileage, vehicle details, valuation) via a wrapper |
| **cedocumentmapper** | Legacy v1 document parser — 4,244-line Tkinter monolith, no tests/VCS | Python + Tkinter + Tesseract | Behaviour reference only |
| **cedocumentmapper_v2.0** | **Contract-first rebuild, already ~75% built** (engine done) | Python library + CLI | **Parser to complete & integrate** (steps 3–4) |
| collisionpdf, collisionautomation, dvlaclaudeconnector, valuationbot(*) | Parser-first FastAPI service; React/Vite UI prototype; DVLA connector; valuation prototypes | mixed | Secondary references |

## Contracts to align with (from `ccc` / `collisioncc`)

- **Case status** state machine (`collisioncc/src/lib/case-status.ts`):
  `new_email → ingested → needs_review → ready_for_eva → eva_submitted`, plus branches
  `missing_required_fields`, `missing_images`, `duplicate_risk`; terminals `eva_submitted`,
  `linked_to_instruction`, `box_synced`, `error`.
- **Image rules** (`collisioncc/src/lib/image-rules.ts`): ≥2 EVA-accepted images, including one
  **overview** (registration visible) and one **damage_closeup**; roles
  `overview | damage_closeup | additional | unknown`.
- **EVA export** (13-field JSON, 6-line inspection address) — see [integrations.md](./integrations.md).
- **Work-item / evidence-package / provider-principal-config** contracts in `ccc/docs/contracts/`.

## cedocumentmapper_v2.0

Important: this is **not a green-field rebuild**. The repo already implements a clean, layered,
contract-first parser (~5,100 LOC, Python 3.11+):

- **Done (EPIC-01→07, ~100%):** domain models; readers (PDF/DOCX/DOC/EML/MSG); provider detection
  (required/optional/negative phrase matching); **12-kind rule engine**; field normalisers
  (VRM, date, 6-line address, VAT, mileage); **schema-validated EVA-JSON exporter**; v1→v2 config
  migration; **full CLI** (`read`/`detect`/`extract`/`process`/`providers`/`rules`/`export`/`audit`);
  pytest suite.
- **Outstanding:** review UI (0%), regression corpus harness (~30%), PyInstaller packaging (~20%),
  CI/CD (0%).
- **Licensing risk:** depends on **PyMuPDF (AGPL)** — resolve before any closed-source distribution
  (swap to pdfplumber/Poppler, or buy a commercial licence).
- **Spike implication:** *complete and harden* this parser and expose it for integration (CLI now;
  Azure Function + custom connector later) — reuse the engine; do not re-derive parsing in Power Fx.
