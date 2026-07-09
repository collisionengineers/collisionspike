# Changes — TKT-114: Enforce the ticket lifecycle transition graph in ticket-move.mjs

## Status
built + offline-proven (2026-07-09, PLAN-003 final wave D1) — uncommitted on `feat/final-wave`;
status transition deferred to the dispatching loop.

## Commits
(none yet — the wave's work is uncommitted on `feat/final-wave` per the dispatch instructions)

## Files touched
- `scripts/ticket-move.mjs` — the lifecycle guard: `ALLOWED_TRANSITIONS` graph
  (`backlog→now|next`, `next→now`, `now→verify|done|blocked`, `verify→done|blocked`,
  `blocked→now`, `done→now` reopen), `guardTransition()` runs BEFORE any directory
  creation/move (`ensureStatusDirs()` moved after the guard so a refusal touches
  nothing); an illegal move exits 1 naming the transition + the allowed targets + the
  full graph; **`--force`** bypasses with a loud warning (plus a dedicated
  `verify→now` warning naming it the verify-sweep's reopen path — that transition is
  deliberately `--force`-only, per the sweep policy); **`--migrate` exempt**
  (realigns folders to frontmatter, not a transition); **`--dry-run`** reports the
  identical verdict without touching files. Usage text updated.
- `.claude/skills/ticket-orchestrate/SKILL.md` § Transition guard — heading flipped from
  "`ticket-move.mjs` does NOT enforce it" to "ENFORCES it since TKT-114", plus the
  `--force`/`--migrate`/`--dry-run` semantics and the verify→now `--force`-only rule
  (the two encodings kept in step, per the ticket's Research note).

## Summary — offline acceptance matrix (run 2026-07-09 on this checkout)
`git status docs/tickets` was clean after every refusal — zero files touched.

| Test | Command | Result |
|---|---|---|
| Illegal `backlog→done` (REAL run) | `ticket-move.mjs TKT-018 done` | exit 1; names `TKT-018 backlog -> done` + allowed `now, next`; nothing moved |
| Legal `backlog→now` / `backlog→next` | TKT-018 `--dry-run` | exit 0 |
| Legal `now→verify` / `now→done` / `now→blocked` | TKT-114 `--dry-run` | exit 0 |
| Legal `verify→done` / `verify→blocked` | TKT-001 `--dry-run` | exit 0 |
| Legal `blocked→now` | TKT-004 `--dry-run` | exit 0 |
| Legal `done→now` (reopen) | TKT-003 `--dry-run` | exit 0 |
| `verify→now` WITHOUT `--force` | TKT-001 `--dry-run` | exit 1; refusal text names the `--force`-only sweep-reopen rule |
| `verify→now` WITH `--force` | TKT-001 `--dry-run --force` | exit 0 + TWO loud warnings (guard bypassed + the sweep-reopen explanation) |
| Illegal `done→verify` | TKT-003 `--dry-run` | exit 1 |
| `--migrate --dry-run` | — | exit 0; behaviour unchanged |

Not exercised live: `next→now` (the `next/` column is currently empty; the graph entry is
identical in kind to the tested rows).
