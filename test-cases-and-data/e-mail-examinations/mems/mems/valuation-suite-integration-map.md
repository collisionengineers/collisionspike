---
name: valuation-suite-integration-map
description: "How the 3 valuation repos (skill, valuationbot connector, collisionrenderer) link via the contracts schema, and the seams that break"
metadata: 
  node_type: memory
  type: project
  originSessionId: 692afc4f-251c-4d6a-8993-9e691e167550
---

The vehicle-valuation product spans 3 disjointed-ish repos joined by the **contracts** package (JSON Schema `valuation/v1`: advert, search_result, evidence_pack_payload), all under `active/connectors/valuation-adverts-connector/contracts`:
- **skill** `active/connectors/valuation-adverts-connector/vehicle-valuation/` (also duplicated at `active/collision-agent-skills/vehicle-valuation/` + `archive/*` — DIVERGED copies) — assembles the snake_case evidence_pack_payload, validates vs contracts, renders primarily via `collisionrenderer:render_valuation_outputs` (fallback = local Python `_pdf_common.py` WeasyPrint/Chromium/ReportLab).
- **connector** `…/server-ts` (valuationbot-mcp) — search→adverts, `capture_advert_pages`→PDFs as `{url,status,filename,pdf_base64}`. Render proxy/tool REMOVED (convergence landed; `render-proxy.ts` now just health-envelope env constants). Hand-mirrors the contract zod (does NOT import contracts).
- **renderer** `active/collisionrenderer/` (.NET 8; "Document Renderer" mcpb) — `render_valuation_outputs(payload snake_case, captures[])` → `ValuationPayloadMapper` snake→camel + `subject_vehicle`→`subject` → C# DTOs (`Models/Documents.cs`) → Scriban → PDF + appends advert PDFs (matched by EXACT url string).

GOOD: snake_case boundary aligned; required-field sets match 1:1 (top 9 / subject 9 / advert 19); captures[]/pdf_base64 path matches across all three.

SEAMS THAT BREAK (ranked):
1. ✅ FIXED (2026-06-27) skill validation dead in prod: `validate_evidence_pack.py` did UNCONDITIONAL `from contracts.valuation.v1…` via sys.path discovery of a sibling `contracts/` never shipped with the standalone skill → ModuleNotFoundError crashed the validator AND the render scripts that import it. Fix applied: vendored generated pydantic into `vehicle-valuation/scripts/_vendor/contracts/` (+ refresh README), `_add_contracts_python_path()` now prefers `_vendor`, import wrapped in try/except → degrades to a warning, pydantic pre-check guarded on `EvidencePackPayload is not None`. Smoke-tested OK.
2. ✅ FIXED (2026-06-27) silent wrong-date: contract+skill send `meta.report_date` but renderer read `meta.date` only → every PDF dated today. Fix applied in `active/collisionrenderer/.../ValuationPayloadMapper.cs` CamelizeObjectWithSubjectRename: alias `meta.reportDate`→`date` (no clobber of explicit date). Builds clean. NOT yet shipped — needs collisionrenderer .mcpb rebuild.
3. ✅ FIXED (2026-06-27) capture↔advert match was exact ordinal `url` → cosmetic drift → "missing captured advert PDFs" false negative. Fix: `ValuationPayloadMapper.NormalizeUrl` (lower scheme/host, drop default port, trim trailing slash, drop #fragment, keep query) applied to both the byUrl dict key and the lookup. Tested.
4. ✅ PARTIAL (2026-06-27) drift CI: added `CollisionRenderer.Mcp.Tests/ContractConformanceTests.cs` — loads the contract JSON Schema (walks up to the collisionsuite super-checkout; soft-skips if absent) and asserts the renderer's RequiredSubject/RequiredAdvert (now `internal`, via `InternalsVisibleTo`) == schema `$defs.{SubjectVehicle,EvidenceAdvert}.required`, plus a `report_date` alias regression test. Still hand-mirrored: connector zod + UI ts have no equivalent guard.
5. 🟠 skill duplicated across repos and diverged (must pick a canonical copy before fixing #1).
6. ⚪ stale docs: `server-ts/PORT-STATUS.md` lists retired `render_valuation_outputs` as served.

Contracts package is private/path-only (`@collision/contracts` private:true, `collision-contracts` unpublished); codegen is deterministic + committed (`contracts/scripts/generate.py`). Related: [[valuationbot-chromium-autoinstall-electron-fix]], [[project-renderer-convergence]], [[project-collisionsuite-structure]].
