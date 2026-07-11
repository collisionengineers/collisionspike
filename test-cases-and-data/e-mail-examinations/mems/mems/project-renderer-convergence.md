---
name: project-renderer-convergence
description: Renderer deduplication — consolidated 3 PDF renderers onto .NET collisionrenderer; all waves done, report-renderer deleted (install .mcpb to activate)
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c81e8ab-e5c7-4be5-80f1-c72c5aecbc28
---

Decision (2026-06-26): the suite renders the same CE valuation report + advert evidence pack **three times** (report-renderer Python [dying], collisionrenderer .NET, vehicle-valuation skill Python). Chosen direction: **collisionrenderer (.NET) is the one canonical engine**; delete report-renderer; migrate the Python skill to call collisionrenderer — full 3-way convergence. No rewrite in another language (Chromium dominates, host language is just glue).

Plan + progress log live at `C:\Users\Alex\.claude\plans\we-are-working-on-cryptic-nova.md` (5 waves).

**Waves 1-3 DONE, committed on branch `renderer-mcp-host` in the nested collisionrenderer repo (cc87b41, f92fb56, 26857d7):** Wave 1 = `src/CollisionRenderer.Mcp/` stdio host (ModelContextProtocol 1.4.0, assembly `collisionrenderer-mcp`) exposing `render_valuation_outputs` as a byte-compatible drop-in for the report-renderer contract; 17 tests; snake↔camel + `subject_vehicle→subject` via a pure key-transform mapper (round-trip guarded). Wave 2 = `tests/parity/parity_check.py` cross-engine gate (Python WeasyPrint vs .NET Chromium) — both cases PASS (no dropped fields, page/append parity). Wave 3 = `.mcpb` packaging (manifest schema-validated; `build-mcpb.ps1`; self-contained exe verified to render).

**Waves 4 & 5 DONE (2026-06-26) — convergence complete.** Wave 4a: both `vehicle-valuation` SKILL.md copies (canonical `active/collision-agent-skills/` + the untracked bundled copy in the connector) now call `collisionrenderer:render_valuation_outputs` with inline `{url,status,filename,pdf_base64}` captures, re-capturing selected URLs on a workspace handoff (no artifact store), **with skill-local Python render kept as a graceful fallback** — this dissolved the install-ordering blocker (the workflow falls back rather than breaking if the .mcpb isn't installed yet). The workspace-app UX = **Option (a)** (app only submits the handoff; PDFs arrive in chat) and needed **zero UI surgery** because the app already only hands off on Build — the earlier "in-app render blocker" was a misread (the app passively *displays* the skill's same-server render result; it never rendered itself). Wave 4b: removed valuationbot's `render_valuation_outputs` tool + the `uploadCaptureArtifact` store-upload, gutted `render-proxy.ts` to the env constants `health.ts` needs, deleted 2 obsolete tests, updated manifest/server instructions/health note — verified `tsc` clean + vitest zero-new-failures (6 pre-existing unrelated fixture ENOENTs) + UI 64/64. Wave 5: **deleted `connectors/report-renderer/`** (recoverable via its GitHub remote) and cleaned authoritative docs only (INDEX, SETUP, .gitignore, connector AGENTS/README, ARCHITECTURE-OVERVIEW.{md,json}) — historical research/sprint archives left as-is. **All uncommitted** across 3 working trees. Only manual step left: install the .mcpb in Claude Desktop to make collisionrenderer the *active* engine.

See [[project-collisionsuite-structure]] and [[project-grand-architecture-overview]] (this was the overview's "single most consequential undecided question", now decided in favour of the .NET engine).
