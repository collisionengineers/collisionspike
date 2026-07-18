---
name: box-scope-guard
description: Box scope safety guard — blocks live Box ops outside test folder 392761581105 until liveReady=true
metadata: 
  node_type: memory
  type: project
  originSessionId: e3a68ae1-4438-4662-af93-32197902ca09
---

The live Box integration build is hard-scoped to ONE Box folder — **392761581105 ("test folder")** —
and subfolders created under it. A four-layer guard enforces this (built 2026-06-22, Phase 0 of the
plan at `~/.claude/plans/you-are-planning-the-shiny-tiger.md`):

- **Layer 1 (the guard):** `.claude/hooks/box-scope-guard.mjs` — a **blocking** PreToolUse hook on Bash.
  Denies (exit 2) any `box` CLI / `api.box.com` REST / Box-SDK command that references folder `0` or an
  id outside the allowlist; webhook creates may target only the root. `.claude/hooks/box-scope-postcreate.mjs`
  (PostToolUse) auto-appends child ids created under an allowed parent. Shared logic in
  `box-scope-lib.mjs`. Config: **`tools/box-scope.json`** `{ allowedRoot, allowedIds, liveReady }`.
- **Layer 2:** the `box-webhook` Function facade rejects any `parent.id`/`target.id` outside the root via
  a `BOX_ALLOWED_ROOT_ID` env-var assert (wired at Phase C deploy).
- **Layer 3:** a `tools/box/` CLI/SDK wrapper passes literal ids resolved from the allowlist.
- **Layer 4:** the flow linter `BOX_ID_LITERAL_RE` (only id source is the `cr1bd_BOX_FOLDER_ROOT_ID` env-var).

**The toggle:** set `liveReady: true` in `tools/box-scope.json` ONLY when ready to operate beyond the test
folder (production cutover) — that lifts Layer 1. Until then it is strict.

**Arming gotcha:** the hooks are registered in `.claude/settings.json`, but a hook added mid-session is
**not enforced until Claude Code reloads/approves it** (run `/hooks` or restart). Verify with
`node tools/box/test-scope-guard.mjs` (Gate 0 = 16/16). Layers 2–4 still apply when Layer 1 isn't armed.
Relates to [[box-pivot-phase7-committed]] and [[box-test-account]] (that free account is superseded by the
Business account whose CCG creds live in Infisical).
