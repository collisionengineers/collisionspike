---
name: collisionsuite-structure
description: Monorepo layout and key renamed/moved repos in collisionsuite after 2026-06-23 reorganisation
metadata: 
  node_type: memory
  type: project
  originSessionId: 13beaaeb-275e-4678-86f7-93e13ad09960
---

collisionsuite/ is a monorepo under C:\Users\Alex\Documents\GitHub\collisionsuite\ that was reorganised 2026-06-23. All formerly separate GitHub repos were moved into subdirectories here.

**Why:** Centralise all Collision Engineers projects under one folder for cross-project navigation.
**How to apply:** Always use paths relative to collisionsuite/ root when referencing sibling repos.

Key renamed/moved repos (important for documentation):
- `dvla-dvsa-connector` → now at `connectors/dvla-dvsa-connector/` (formerly `dvlaclaudeconnector` standalone, and `dvladvsa` as connector folder inside collisionplugin)
- `valuation-adverts-connector` → now at `connectors/valuation-adverts-connector/` (formerly `valuation-tool` inside collisionplugin)
- Runtime name for valuation-adverts-connector is still `valuationbot` (Cloud Run service name)
- Runtime name for dvla-dvsa-connector is still `dvsa-mot` / `dvsa-mot-mcp`

**2026-06-24 detachment:** every connector and the skills set became its own *private* GitHub repo under `github.com/collisionengineers/` (no longer tracked by the suite meta-repo; each is a gitignored nested repo):
- `skills/` was **renamed to `collision-agent-skills/`** and is now its own repo (`collision-agent-skills`). The `mcp-debugger` skill (was in `connectors/mcp-debugger/`) was moved into it.
- New private repos: `dvla-dvsa-connector`, `mcp-gateway`, `report-renderer`.
- `evaconnector`: the canonical (more recent/complete) copy lived at `archive/evaconnector` (own repo); it was **consolidated into `connectors/evaconnector/`** and the stale `connectors/` snapshot deleted. `archive/evaconnector` no longer exists.
- Already-standalone: `valuation-adverts-connector` (private).
- `active/web-dev/` is a local-only standalone repo (no remote yet) — website planning repo; live site `collision-engineers-website` is a nested repo under it.

**2026-06-25:** the suite root `collisionsuite` is now its **own private GitHub repo** (`github.com/collisionengineers/collisionsuite`) — it is the orchestration/index repo: clone it, then follow `SETUP.md` to clone every nested repo into the correct folder. It tracks only `INDEX.md`, `SETUP.md`, `.gitignore`, `collision-engineers-context/`, and `research/` (non-bulkdata/non-reference-material); all nested repos are gitignored. `active/mileagetool/` (WinUI `RegLookup` DVLA/DVSA tool) became its **own private repo** (`github.com/collisionengineers/mileagetool`); its `Secrets.g.cs` is Infisical-injected and gitignored. Local-only, never pushed: `document-work/` (claims/business data + large recalls datasets) and `connectors/` workspace config (`.claude/`, `.agents/`, `skills-lock.json`) — all gitignored by the suite root.

collisionplugin was **dissolved 2026-06-23**:
- Its skills → `collision-agent-skills/` (own repo as of 2026-06-24)
- Its connectors → `connectors/` (each now its own repo; superseded copies in `archive/superseded-connectors/`)
- Its dev-docs/build-scripts → `collision-engineers-context/collisionplugin-dev-docs/`
- Shared valuation contracts → `connectors/valuation-adverts-connector/contracts/`

Active projects:
- `active/collisionspike/` - Power Platform spike
- `active/collisionrenderer/` - PDF renderer
- `active/cedocumentmapper_v2.0/` - parser engine

Archive (historical reference, do NOT update old names in these):
- `archive/dvlaclaudeconnector/` - old standalone DVLA connector
- `archive/valuationbot/` - old standalone valuation bot
- `archive/ccc/`, `archive/collisioncc/`, etc.

Context docs:
- `collision-engineers-context/` - cross-project context store
- `collision-engineers-context/collisionplugin-dev-docs/` - archived collisionplugin docs (still use old names internally — intentional)

**2026-06-26 — folder-type taxonomy (per user):** every top-level subfolder is one of three kinds, documented in `INDEX.md` "Folder types":
- **Category folder** — holds sibling repos of one kind *plus* shared skills/MCPs + workspace config for those repos (e.g. `connectors/` → `.claude/`, `.agents/`, `skills-lock.json`).
- **Repos** — lifecycle containers of project repos: `active/`, `archive/`, `on-hold-projects/`; plus standalone top-level repo `collision-agent-skills/`.
- **Documentation** — cross-project docs: `research/`, `collision-engineers-context/`.

Also: `active/web-dev/` *should* become its own GitHub repo under `collisionengineers/` (currently local-only, no remote). `active/spreadsheet-work/` = local copies of the active spreadsheets CE use (plain folder, not a repo, not tracked). The nested `collision-engineers-website` is the LIVE base44 site — see [[base44-website-push-guard]].
