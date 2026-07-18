---
name: suite-plans-plan-set
description: "suite-plans/ holds the six-folder reviewed plan set (tickets migration, kanban, reorg, skills, agent team, symlink expansion) built 2026-07-17 — PROPOSED, nothing executed, key user decisions open"
metadata: 
  node_type: memory
  type: project
  originSessionId: ccd81f4f-36b1-47db-8051-8d5bf23807f7
---

On 2026-07-17 `suite-plans/` was built out into six plan folders (01-ticket-migration, 02-kanban-board, 03-reorganization, 04-skills-adoption, 05-agent-team, 06-symlink-skills-expansion) + README.md index. Drafted from verified recon (13-agent workflow), then 29 adversarial-review findings all applied. Everything is Status: PROPOSED — nothing executed. `2026-07-16-suite-ticket-system-migration.md` is superseded by 01 but kept for provenance; `reorganize.txt` is an empty user placeholder.

**Why:** future sessions should treat `suite-plans/README.md` as the entry point for suite-evolution work, and must not re-draft or execute these plans without user approval.

**How to apply:** read `suite-plans/README.md` first. Open user decisions before any execution: commit the untracked suite-plans content (cmdAudit fails on any suite-root `??` entry), capture `.azure/` disposition, in-flight spike branches (capture-golive/capture-server per [[capture-hardening-2026-07-16]], plus e-mail-preview-fixer TKT-169 with a live worktree — a SIXTH branch touching docs/tickets), dirty collisionkb, collisionplugin-dev-docs keeper dispersal, Anthropic doc-skills licensing. Recon corrections to remember: spike now has 230 tickets (max TKT-237, not 211/218 per [[capture-server-exists-tkt200]] era); capture's codex/guided-camera-feasibility upstream is NOT gone; suite-plans/ is tracked, not ignored.
