---
name: suite-structure
description: collisionsuite monorepo layout (now on Linux at /home/alex/projects/collisionsuite/) — folder-type taxonomy, nested gitignored repos, and the live-website guard. Cross-project context.
metadata:
  type: reference
---

`collisionsuite/` is the umbrella monorepo, now at **`/home/alex/projects/collisionsuite/`** (it was on
Windows at `C:\Users\Alex\Documents\GitHub\collisionsuite\`; this repo relocated under it in commit
`84dbe6f`). Paths in collisionspike docs are relative to `collisionsuite/active/collisionspike/`.

**Folder-type taxonomy (per the operator):** every top-level subfolder is one of three kinds —
- **Category folder** — sibling repos of one kind + shared skills/MCPs + workspace config
  (e.g. `connectors/` with its `.claude/`, `.agents/`, `skills-lock.json`).
- **Repos** — lifecycle containers: `active/`, `archive/`, `on-hold-projects/`; plus the standalone
  top-level `collision-agent-skills/` repo.
- **Documentation** — cross-project docs: `research/`, `collision-engineers-context/`.

**Nested repos.** Most projects are their **own private GitHub repos** under `collisionengineers/`,
gitignored by the suite root: each connector (`dvla-dvsa-connector`, `valuation-adverts-connector`,
`mcp-gateway`, `report-renderer`, `evaconnector`), `collision-agent-skills` (was `skills/`),
`mileagetool` (the WinUI `RegLookup` tool), and the suite root itself (orchestration/index repo — clone
it then follow `SETUP.md`). `active/web-dev/` is a planning repo that wraps the **live**
`collision-engineers-website` as a nested repo — see [[base44-website-push-guard]].

**Renames to remember:** `dvla-dvsa-connector` (was `dvlaclaudeconnector` / the `dvladvsa` folder),
`valuation-adverts-connector` (was `valuation-tool`; runtime name still `valuationbot`). `collisionplugin`
was **dissolved 2026-06-23** — its skills → `collision-agent-skills/`, its connectors → `connectors/`,
its dev-docs → `collision-engineers-context/collisionplugin-dev-docs/`.

**How to apply:** reference siblings by suite-relative path; this is cross-project context for orienting
within the suite, not collisionspike runtime. Relates to [[suite-architecture-overview]],
[[sibling-projects-pointers]].
