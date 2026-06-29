---
name: project-grand-architecture-overview
description: Where the Collision Suite Grand Architecture Overview lives + its two headline findings; read before re-running the overview skill
metadata: 
  node_type: memory
  type: project
  originSessionId: 73d9b52e-b961-416a-ae99-d22ed3fe08e0
---

A full Grand Architecture Overview of the active Collision Suite (13 projects) was produced 2026-06-26 and lives at `collision-engineers-context/ARCHITECTURE-OVERVIEW.md` (human view) + `ARCHITECTURE-OVERVIEW.json` (companion / source-of-truth for the next *update* run — carries the manifest, 13 profiles, 24-seam index, all 44 verified + 9 rejected opportunities with stable IDs). Re-running [[grand-architecture-overview]] should diff against the `.json`, not regenerate.

**Two headline findings (non-obvious, took an 81-agent fan-out to establish):**
1. The suite is **two-and-a-half products joined only by VRM** — the Power Platform case app (`collisionspike`, owns `Case`), the Claude/MCP skills+connectors suite, and the island `collision-engineers-website` — with the product spine broken at three seams: web→case (no Case is created from web leads), DVLA/DVSA enrichment built **4×** (spike Fn / dvla-dvsa-connector / mileagetool / skills), and branded PDF rendering built **4×** in two languages.
2. The **remote-removal sprint** (`collisionplugin-dev-docs/plans/release-sprint-1/remote-removal/removal-plan.md`, 2026-06-16) **deletes `mcp-gateway` and decommissions `report-renderer`**; connectors collapse to local stdio (`dvsa-mot`, `valuationbot`), `evaconnector` becomes dev-holding. The `INDEX.md` catalogue still lists 5 co-equal connectors — stale. **Do not build new work on mcp-gateway / report-renderer.** Separately, `collisionrenderer` (.NET) renders the same valuation docs as the `vehicle-valuation` skill (Python) and was never reconciled — the suite's biggest undecided question.

Highest-leverage Wave-0 moves: mileage-parity test (verified), publish one DVLA/DVSA enrichment JSON Schema (verified), publish brand design tokens as a package, decide the canonical renderer, build the Base44↔Dataverse auth binding (gates the web→case spine). Related: [[project-collisionsuite-structure]], [[base44-website-push-guard]].
