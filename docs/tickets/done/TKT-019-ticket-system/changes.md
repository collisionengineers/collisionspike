# Changes — TKT-019: Build the Markdown ticket system + board + validator

## Status
done

## Commits
- `94902ce` — work-todo-spike mega-commit → introduced the atomic Markdown ticket system: one `.md` per ticket with YAML frontmatter, the Kanban-style `BOARD.md` tracker, and the zero-dependency `scripts/check-tickets.mjs` validator (frontmatter present, enums valid, `research-link` resolves, ids unique).
- (2026-06-30 restructure) — moved every ticket into its own per-ticket folder with `changes.md` / `verification.md` / `evidence/`, and made `scripts/check-tickets.mjs` recurse into those folders.

## Files touched
- `docs/tickets/` (per-ticket folders, `README.md`, `BOARD.md`)
- `scripts/check-tickets.mjs`

## Summary
Replaced the unindexed `work-todo-spike` stub/research drop-zone with an atomic ticket system: one file per ticket with structured frontmatter, a board mirroring each ticket's column, and a dependency-free validator. A later restructure gave each ticket its own folder (spec + changes + verification + evidence) and made the validator recurse.
