---
name: suite-agents-policy
description: "Suite-wide agent-guidance policy — AGENTS.md/.agents canonical, CLAUDE.md/.claude/.codex symlinked views; suite.mjs tooling; which repos are deferred"
metadata: 
  node_type: memory
  type: project
  originSessionId: 8a0f65e5-c065-4360-bad0-28ecb6418116
---

Suite-wide policy (user-directed 2026-07-16): **`AGENTS.md` + `.agents/` are canonical in every repo; `CLAUDE.md`, `.claude/<sub>`, `.codex/<sub>` are git-tracked SYMLINKS onto them.** Never edit the views; never create a real CLAUDE.md.

**Why:** one tool-agnostic source of truth (Claude reads CLAUDE.md, Codex reads AGENTS.md); kills hand-mirrored duplication (collisionspike tracked the same 10 skills twice; the collision-engineers-design skill existed under three different conventions in three repos).
**How to apply:** new repos follow the New Project Checklist in suite AGENTS.md + template at `collision-engineers-context/templates/AGENTS-template.md` (contains the standardized `suite-context:v1` stub, hash-checked by audit). `node tools/suite.mjs links` creates/repairs; `audit` fails on degraded links (plain-text files = checkout without symlink support). Windows prereqs: Developer Mode + `git config --global core.symlinks true` (set globally + per-repo 2026-07-16; sub-repos had stale local `core.symlinks=false`).

Key mechanics (verified in docs): Claude Code loads CLAUDE.md from every ANCESTOR dir crossing git boundaries → suite-root CLAUDE.md symlink reaches sessions started inside any nested repo; Claude does NOT read AGENTS.md natively; settings/hooks/skills do NOT ancestor-walk (suite-wide bindings must be git hooks or ~/.claude). Codex doesn't look above its git root → per-repo stub covers it.

**Recognized variant — generated adapters (added 2026-07-16 eve):** a repo may instead derive `.claude`/`.codex`(/`.cursor`) from `.agents/` via a committed hash-locked generator + thin real CLAUDE.md deferring to AGENTS.md; marked `"guidance": "generated-adapters"` in the manifest; audit still requires the stub but skips symlink checks; `links` skips the repo entirely (never fight the generator). **collisionspike** is this variant (its PLAN-006 reset ships `scripts/maintenance/generate-agent-adapters.mjs`, pre-commit enforced — do NOT symlink its `.claude/.codex` or delete its CLAUDE.md).

**Adoption state (2026-07-16 eve): all adopted except `mileagetool`** (origin TKT-152 rewrote CLAUDE.md; still only a 409-byte CLAUDE.md, no AGENTS.md — the sole audit warning). collisioncapture adopted in standard symlink mode (CE design skill re-homed `.codex/skills`→`.agents/skills`; its 4 ticket skills remain UNTRACKED with user's in-flight work). Exception category: per-tool FORMATS (`.claude/agents/*.md` vs `.codex/agents/*.toml`) stay real files, not symlinks. Details in [[suite-manifest-tooling]] / suite.manifest.json notes.

Windows gotcha (bit an agent 2026-07-16): Git Bash `ln -s` can silently create COPIES (MSYS winsymlinks fallback) — create symlinks via Node `fs.symlinkSync` / `suite.mjs links` and verify with `lstat().isSymbolicLink()`.

Unverified watch-item: whether Claude Code skill discovery follows a symlinked `.claude/skills` dir — check in a session inside a migrated repo (e.g. web-designs).
