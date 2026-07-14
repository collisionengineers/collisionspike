# Changes — TKT-004: Allocate the next Case/PO number reliably

## Status
blocked — DB-authoritative mint is live and correct; the production Archive-aware allocator is subordinate
to TKT-178's three-input reconciliation and cannot be enabled from a root id alone.

## Commits
- `c87430d` — fix(intake): parse.ts→parser contract, Box folder at intake, Case/PO mint → the live Case/PO mint (pure DB MAX+1 over the provider sequence).
- `94902ce` — feat(work-todo-spike): mega-commit (TKT-001..014,019,020) → the Case/PO preview route that carries the Box-aware fallback.

## Files touched
- intake/Case-PO mint path (orchestration) and the API preview route.

## Summary
The authoritative live Case/PO mint is currently pure DB MAX+1 over the provider sequence. The preview route
has an Archive-listing helper, but neither it nor a “latest folder + 1” result is cutover authority.
Production activation now fails closed behind TKT-178: signed/checksummed spreadsheet, authenticated
production EVA API, exact approved production Archive root/write scope, restore proof, frozen ledger hash,
version-locked executor and named window. Historical floors derive from the complete closed-world ledger and
include every valid allocation per prefix; floor reads fail closed; exact canary object+parent metadata—not
a root listing—proves placement. Test/mirror/Viewer access and a bare root id are insufficient.
