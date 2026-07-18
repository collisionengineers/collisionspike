---
name: reciprocal-ai-review-retired
description: "The reciprocal-AI PR-review workflow was retired on main (TKT-149, 2026-07-14) — don't reintroduce it; docs/tickets that cite it as live are stale"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c7a881b-5f57-4ff9-92e3-c5384ff58f71
---

The mandatory **reciprocal Claude+Codex PR-review workflow** (`.github/workflows/reciprocal-ai-review-markers.yml`, `scripts/hooks/reciprocal-pr-review.*`, `.github/scripts/review-marker-status.*`, the `test:pr-review-hooks` npm script) was **retired on `main` by TKT-149 on 2026-07-14** and deleted from the tree.

**Why it matters / how to apply:**
- When rebasing an older feature branch that also removed the workflow, git **drops** that removal commit as "already upstream" — expected, not an error.
- Resolving a `package.json` conflict: main removed `test:pr-review-hooks` from the `test` chain and deleted its referenced files, so **drop** any branch-side re-addition of `test:pr-review-hooks` (keeping it breaks `npm test`).
- Ticket evidence (`verification.md`/`changes.md`) that says "reciprocal PR markers bind the exact PR head/base" or counts a "reciprocal PR review hooks — 48 tests" suite is **stale/wrong** — that suite no longer exists. Bind head/base to the actual PR SHA and don't count the phantom suite. (Seen + fixed on PR #73 / [[pr73-tkt154-rebased-remediated]].)
- Do **not** reintroduce the reciprocal-review workflow/hooks/scripts.
