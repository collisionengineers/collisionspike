---
name: project-claude-desktop-debug-skill
description: "claude-desktop-debug skill — location, purpose, and structure for future reference"
metadata: 
  node_type: memory
  type: project
  originSessionId: 715f5c96-9cee-4793-99b6-5a0c6895be4a
---

Skill `claude-desktop-debug` now lives in the **collision-agent-skills** repo (as of 2026-06-24):
`C:\Users\Alex\Documents\GitHub\collisionsuite\collision-agent-skills\claude-desktop-debug\`
(was previously under `connectors/`; a working copy is also mirrored in the connectors workspace at `connectors\.claude\skills\claude-desktop-debug\`). Sibling skill `mcp-debugger` is a *separate* skill in the same repo — not the same as this one.

**Why:** Diagnose Claude Desktop chat-side issues on Windows — MCP tools missing, extensions not loading, white screen, crashes, auth loops, slow performance. Scoped to the Desktop app chat UI (not Claude Code CLI).

**Structure:**
- `SKILL.md` — main skill with install-type detection, issue decision tree, log triage, config validation
- `references/mcp-tools-missing.md` — npx cmd/c wrapper, MSIX path mismatch, PATH inheritance
- `references/extensions-not-loading.md` — mcpb bundles, dxt-install dirs, clean reinstall
- `references/app-not-loading.md` — GPU flags (--disable-gpu-compositing), autostart DLL crash
- `references/auth-and-models.md` — ANTHROPIC_API_KEY conflict, OAuth token cache clear
- `references/performance.md` — GPU compositing, cache clearing, Electron memory
- `scripts/diagnose.ps1` — self-contained PowerShell snapshot script (no Python dependency)
- `evals/evals.json` — 5 test prompts

**How to apply:** When working on this skill, read from the above paths. The skill is written for non-developer end-users; all commands are PowerShell with no Python dependency. The `diagnose.ps1` script is the single-paste diagnostic tool.

[[project-collisionsuite-structure]]
