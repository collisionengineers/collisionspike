---
name: suite-architecture-overview
description: Pointer to the Collision Suite Grand Architecture Overview + its durable structural findings (two-worlds-joined-by-VRM; enrichment & PDF rendering each built 4×; remote-removal sprint kills mcp-gateway/report-renderer). Cross-project context, may have aged.
metadata:
  type: reference
---

A suite-wide Grand Architecture Overview lives at
`/home/alex/projects/collisionsuite/collision-engineers-context/ARCHITECTURE-OVERVIEW.md` (human view) +
`ARCHITECTURE-OVERVIEW.json` (companion / source-of-truth for the next *update* run — manifest, project
profiles, seam index, opportunities with stable IDs). Re-running the overview should **diff against the
`.json`**, not regenerate.

**Durable structural findings (cross-project; produced 2026-06-26 — may have aged):**
- The suite is **"two-and-a-half products joined only by VRM"**: the case-intake app (collisionspike,
  owns `Case`), the Claude/MCP skills+connectors suite, and the island `collision-engineers-website` —
  with the spine broken at three seams (web→case has no Case created from web leads; DVLA/DVSA
  enrichment built **4×**; branded PDF rendering built **4×** in two languages).
- The **remote-removal sprint** decommissions `mcp-gateway` and `report-renderer`; connectors collapse
  to local stdio (`dvsa-mot`, `valuationbot`). **Do not build new work on `mcp-gateway` / `report-renderer`.**

**How to apply:** treat as orientation for cross-project decisions; verify against the live `.json`
before acting, since this snapshot predates later suite changes. Relates to [[suite-structure]],
[[sibling-projects-pointers]].
