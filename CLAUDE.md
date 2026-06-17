# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A **spike / planning repository** for automating the Collision Engineers case-intake admin workflow. There is no application code yet — the repo currently holds only `adminoverview.md` (the domain/process description) and `.claude/settings.json`. The intent is to build tooling (likely a Power Platform app, given the enabled plugins) that streamlines how cases move from incoming instructions/images into the **EVA** system.

When implementing, treat `adminoverview.md` as the source of truth for the business process. Several areas in it are explicitly marked as **not fully understood** (inspection address derivation, Audatex's full role) — surface these as open questions rather than inventing behavior.

## Domain model (the part that needs reading multiple sources to grasp)

The core workflow is **intake → enrich → load into EVA → store evidence in Box → hand off to engineer**. A case can arrive partial, so intake branches:

- **Ready for EVA** — all required artifacts present. Either loaded immediately or parked in the "ready" half of a tracking spreadsheet for later input.
- **Missing info** — logged to the "not ready" half of the spreadsheet. The two recurring gaps are: (a) instructions received but **no images** (must chase the provider/garage, await Audatex, or extract from email/PDF), or (b) images received but **no instructions** (images stored by vehicle registration on a shared drive until instructions arrive).

**Artifacts required to load a case into EVA:** saved email (`.eml`), vehicle images, valuation evidence (Companion Report PDF), and initial instructions.

**Systems involved:** EVA (case store + report generation; JSON drag-and-drop import today, API planned), Box (evidence storage, one folder per Case/PO), Excel (pre-EVA tracking spreadsheet), Audatex (secondary API-based provider — **treat as deferred**, may be superseded/integrated later).

**Intake channels:** three separate Outlook inboxes (most common), WhatsApp (secondary), Audatex API (least common).

### Business rules that any implementation must honor

- **Case/PO format:** `Principal` + 2-digit year + 3-digit sequential case number for that provider. The Principal is a 4-char internal code Collision Engineers assigns per provider. Example: provider with Principal `CCPY`, 50th case of 2026 → `CCPY26050`. The Box folder is named with this Case/PO.
- **Photo upload order (EVA):** first upload exactly **2 preview photos** (vehicle overview + closeup of main damage), then upload **all** photos in sequence — **including those same first two again** (they appear both as previews near the report top and later in the full sequence). The overview photo must show the full vehicle registration.
- **Photo exclusion:** any photo showing a person's reflection in the vehicle is unusable.
- **Video fallback:** if a video is sent without sufficient images, key frames are screenshotted to produce the needed images.
- **Inspection address** is derived ad hoc (email content, admin domain knowledge) and falls back to "Image Based Assessment" when unclear — this process is not fully specified yet.

### Enrichment steps EVA supports / requires per case

Valuation (EVA integrates with valuation tools; evidence = downloaded Companion Report PDF), Experian adverse-history check (built into EVA), and mileage (estimated from MOT data when not supplied).

## Existing tools referenced (not in this repo)

- **`cedocumentmapper`** — a Python tool that extracts key data from instruction PDFs and emits the JSON that EVA imports. Works for essentially all providers but is **acknowledged as poorly engineered** (built in one long Claude session, no version control). Expect a ground-up redesign rather than incremental patching if asked to work on it.
- **DVSA/DVLA mileage MCP server** — an existing MCP server with tools that call the DVLA VES API and the DVSA MOT API to obtain mileage. Candidate for integration into the intake system.

## Available tooling (Power Platform + Azure plugins)

Plugins enabled in `.claude/settings.json`: `mcp-apps`, `canvas-apps`, `azure`. The broader Power Platform skill set is also available. Pick the build approach via these skills (invoke with the Skill tool):

- **Canvas Apps** (`canvas-apps:canvas-app`) — low-code multi-screen apps authored through the Canvas Authoring MCP. Use for a tracking/intake UI replacing the spreadsheet. Run `canvas-apps:configure-canvas-mcp` first if the MCP isn't connected.
- **Code Apps** (`code-apps-preview:create-code-app`) — React/Vite apps with Power Platform connectors (`add-dataverse`, `add-sharepoint`, `add-excel`, `add-office365`, `add-onedrive`, `add-teams`, etc.). Best when a richer custom UI or specific connectors (e.g. Outlook for the three inboxes, OneDrive/SharePoint for image storage) are needed. `deploy` and `list-connections` support the workflow.
- **Model-driven generative pages** (`model-apps:genpage`) — for pages over Dataverse entities in a model-driven app.
- **MCP App widgets** (`mcp-apps:generate-mcp-app-ui`) — UI widgets for MCP tools (e.g. the mileage MCP server).
- **Azure** (`azure:*`) — deployment, infra prep, AI (Document Intelligence/OCR is relevant to replacing `cedocumentmapper`'s PDF extraction), storage, etc.

No clear app architecture has been chosen yet — confirm direction before scaffolding, since Canvas vs. Code app vs. model-driven is a foundational decision.

## Conventions

- This is a Windows environment; the primary shell is PowerShell (a Bash tool is also available for POSIX scripts).
- Not yet a git repository — initialize version control before substantial work (the predecessor tool's lack of it is called out as a problem in the overview).
