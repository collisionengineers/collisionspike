# Changes — TKT-013: Define + enforce the per-provider automation modes

## Status
done

## Commits
- `94902ce` — work-todo-spike mega-commit → canonicalised the automation-mode set, exposed a per-provider update path, and made the orchestration honour the provider's mode.
- `1d8708d` — fix(intake): decouple Box folder/archive/image-extract from automation mode (work-todo-spike Both) → record-keeping (Box folder/archive/image-extract) now runs regardless of mode; only enrichment is deferred in manual mode.

## Files touched
- `orchestration/` intake orchestrator (provider-mode branch)
- provider corpus automation-mode field / update path

## Summary
Automation mode was the missing per-provider axis. The mode set was canonicalised, a provider update path added, and the orchestrator branches on the provider's mode. Commit `1d8708d` decoupled record-keeping (Box folder/archive/image extraction) from the mode so it always runs, deferring only enrichment in manual mode.
