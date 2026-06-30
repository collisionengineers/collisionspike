# Changes — TKT-004: Allocate the next Case/PO number reliably

## Status
blocked — DB-authoritative mint is live and correct; the Box-aware allocator needs the production Box root id from the operator.

## Commits
- `c87430d` — fix(intake): parse.ts→parser contract, Box folder at intake, Case/PO mint → the live Case/PO mint (pure DB MAX+1 over the provider sequence).
- `94902ce` — feat(work-todo-spike): mega-commit (TKT-001..014,019,020) → the Case/PO preview route that carries the Box-aware fallback.

## Files touched
- intake/Case-PO mint path (orchestration) and the API preview route.

## Summary
The authoritative Case/PO mint is a pure DB MAX+1 over the provider sequence and works correctly live. The Box-aware fallback (find the latest provider folder + 1) lives only in the preview route, not in the mint itself. The operator wants the allocator to read the PRODUCTION Box area, not the test folder, and has not yet supplied the production Box root id — so the mint cannot be made Box-authoritative yet.
