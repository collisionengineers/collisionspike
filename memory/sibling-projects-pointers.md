---
name: sibling-projects-pointers
description: Durable reference pointers to the sibling repos in collisionsuite (parser engine, renderer, valuation suite, DVLA/DVSA connector + RegLookup, skills). Reference-only for collisionspike; detailed work-logs belong to each repo's own memory.
metadata:
  type: reference
---

Brief, durable pointers to the sibling projects in the suite (see [[suite-structure]] for paths).
These are **reference-only for collisionspike** — each repo carries its own detailed work-log memory.

- **cedocumentmapper_v2.0** (`active/cedocumentmapper_v2.0`) — the **parser engine source-of-truth**.
  It is **vendored** into this repo's parser Function (`functions/parser/cedocumentmapper_v2/`) — the
  **edit-in-sibling-then-re-vendor** rule and the open reconciliation items live in that copy's
  `PROVENANCE.md` (authoritative; ADR-0018). The engine is **complete + tested**; **PyMuPDF is
  licensed** (the AGPL concern is closed — don't re-raise it).
- **collisionrenderer** (`active/collisionrenderer`, .NET 8) — the **chosen single canonical PDF
  renderer** for the suite's valuation reports + advert evidence packs (it de-duplicates three former
  renderers; Chromium does the rendering, host language is glue). WinUI GUI + headless engine-core.
- **Valuation suite** — the `vehicle-valuation` skill + the **valuationbot** connector
  (`connectors/valuation-adverts-connector`, search→adverts→`capture_advert_pages` PDFs) + the renderer,
  all joined by the `valuation/v1` JSON-Schema **contracts** package.
- **dvla-dvsa-connector** + **mileagetool / RegLookup** — DVLA (VES) + DVSA (MOT history) lookups
  (OAuth2 client-credentials + X-API-Key). RegLookup is a standalone WinUI 3 tool; the mileage
  estimation algorithm is shared lineage with this repo's enrichment ([[enrichment-mileage-caveat]]).
- **collision-agent-skills** — the standalone skills repo (CE house-style, valuation, rebuttal,
  roadworthy, total-loss, mcp-debugger, claude-desktop-debug, etc.).

**How to apply:** mine these for prior art; **none are canonical for collisionspike** except the
vendored parser engine (edit the sibling, re-vendor per `PROVENANCE.md`). Relates to
[[suite-architecture-overview]], [[audit-case-type]].
