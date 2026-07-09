# Changes — TKT-005: Make the inbox actionable (dismiss removes from view)

## Status
now — coded and in the live SPA bundle, but not yet confirmed live by the operator.

## Commits
- `94902ce` — feat(work-todo-spike): mega-commit (TKT-001..014,019,020) → the dismiss-removes-from-view inbox behaviour, persisting handled/dismissed state on `inbound_email` so handled mail leaves the active view.

## Files touched
- SPA inbox + the triage state path that persists `inbound_email` dismiss/handle state.

## Summary
The dismiss action now persists triage state on `inbound_email` so a dismissed email should drop out of the active list. The behaviour is coded and shipped in the live SPA bundle. It is data-driven on `inbound_email` rows, which now exist again post-reset. The operator reported it not yet working in the live SPA, and the e2e agent did not exercise the SPA UI — so it stays in `now` until confirmed.
