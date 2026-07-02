# Changes — TKT-025: Mark + filter inbox by source mailbox (info/engineers/desk)
## Status
now — built + shipped in the live SPA bundle (rules-engine-v2 Phase 5, 2026-07-02); operator live
click-through verification pending (see [verification.md](./verification.md) for the runbook).
## Commits
- 2026-07-02 — rules-engine-v2 Phase 5: source-mailbox facet-chip row added to the Inbox toolbar
  (`mockup-app/src/screens/Inbox.tsx` + new `mockup-app/src/screens/inbox-mailbox-filter.ts`,
  unit-tested) — multi-select filter by distinct `sourceMailbox` values present in the loaded rows,
  wired into the existing search/subtype/triage-state filter pipeline. `tsc -b` / `vitest` / `npm run
  build` all green; SPA redeployed live 2026-07-02.
## Summary
Captures the operator's ask for a per-source-mailbox visual marker and an inbox
filter across the info/engineers/desk mailboxes. Related to TKT-005 (inbox / email
intake surfacing). Delivered as a toolbar-level chip filter (not a per-row badge) — see
[verification.md](./verification.md) for the exact scope and the live-SPA runbook.
