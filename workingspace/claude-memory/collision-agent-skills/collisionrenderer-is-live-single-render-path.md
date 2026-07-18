---
name: collisionrenderer-is-live-single-render-path
description: The collisionrenderer MCP connector is live with 12 templates; CE skills must route rendering through it with no fallback render paths
metadata: 
  node_type: memory
  type: project
  originSessionId: bf8266c6-a18d-49d3-b2a3-43c0cc0a1b6a
---

The `collisionrenderer` .NET MCP connector (source: `collisionsuite/active/collisionrenderer`, MCP
server `collisionrenderer-mcp`, tools `list_templates`/`get_template_sample`/`validate`/`render`/
`render_valuation_outputs`/`install_browser`) is **live** with 12 templates in
`TemplateCatalog.cs`, including `diminution-rebuttal`, `expert-report`, `total-loss-report`,
`addendum-report`, `part-35-response`, `response-letter`, `fee-note`, `market-valuation-evidence`.
Payloads are camelCase.

**Why:** As of 2026-07-06 (this session), all skill text describing the renderer as a "future
path" with local DOCX fallbacks was purged per the user's explicit no-fallback policy: one render
path per document, and if the connector is unavailable the skill presents the validated payload
and stops — never an alternative renderer.

**How to apply:** Never reintroduce fallback/manual render routes into the CE skills. Two
deliberate exceptions are NOT the collisionrenderer: `total-loss-assessment` renders via its
frozen local `audatex_gen_v4.py` (Audatex-mimic PDF for EVA import, deliberately not CE-branded),
and `roadworthy-report` renders via `render_roadworthy.py` into the third-party HS template.
Signature contract (fixed 2026-07-07 in Core): `signature.name`/`role`/`org` are tri-state —
omitted/null keeps the firm default, an explicit `""` suppresses that line; the firm-only rebuttal
sign-off is `"signature": { "name": "", "role": "" }` (prints "Yours faithfully," + "Collision
Engineers Ltd"). The old omit-signature + paragraph-block workaround is retired from the skills.
Ordering: republish the renderer (MCP `.mcpb` version bump — `manifest.json` and
`Directory.Build.props` move together — and/or API deploy) BEFORE uploading skill zips that rely
on the new form; the pre-fix renderer coalesces `""` back to the engineer-role default.
Skill zips in `collision-agent-skills/` are org-upload distribution artifacts — regenerate
with `python tools/pack_skill.py <skill> <skill>.zip` after skill edits (see
`connectors/handoff.md`); `_dev/` folders are excluded from packing.
