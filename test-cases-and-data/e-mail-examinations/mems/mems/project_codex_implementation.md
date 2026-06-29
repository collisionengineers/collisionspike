---
name: project-codex-implementation
description: "This repo's Agent Skill work is implemented by Codex, not Claude Code. Plans written here must be Codex-oriented (codex_apps, ~/.codex/skills/), with no Claude-specific tooling fallbacks."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 398bffe1-58b5-4da9-b9b0-69053dc9b0da
---

When writing plans, reviews, or scaffolding for `C:\Users\Alex\Documents\GitHub\valuationbot`, target the Codex / `codex_apps` runtime. The user reviews the plan, then Codex executes it.

**Why:** The user corrected an enhancement list that referenced `anthropic-skills:skill-creator` as a fallback and that flagged the absence of `init_skill.py` / `quick_validate.py` under `C:\Users\Alex\.codex\skills\.system\`. Those references were noise — the implementer (Codex) has its own tooling and the verification will happen in Codex's environment, not in Claude Code.

**How to apply:**

- Skills land at `skills/vehicle-valuation/` (repo-local source of truth); installation into `~/.codex/skills/` is a manual copy step.
- Agent manifest is `agents/openai.yaml` per the `codex_apps` agent skill spec.
- Refer to Agent Skill conventions generically (frontmatter, progressive disclosure, description pushiness) — do not name specific Claude Code skills as fallbacks.
- Skip directory probing for `init_skill.py` / `quick_validate.py`; assume the implementer has appropriate scaffolding tools.
- PDF generation stack confirmed: WeasyPrint + Jinja2 templates, structural-and-visual parity with the example PDFs.

Related: [[user-role]].
