# Changes — TKT-178: Reconcile active cases and the Archive at production cutover

## Status

**BLOCKED — plan and offline rehearsal only.** This ticket pass strengthens the future cutover plan; it
does not execute the cutover.

The ticket now fails closed on three unavailable operator inputs: the signed/checksummed job
spreadsheet, an authenticated and contract-verified production EVA API, and an independently confirmed
production Archive root with explicit/proven write, rename, merge and retarget authority. It also
requires backup/restore proof, a frozen deterministic dry-run hash and named final-window approval.

The original operator note remains immutable. A dated clarification records that EVA/Archive/Outlook
are alternative **case-level completion signals only after global preflight**, not substitutes for the
mandatory EVA or production Archive execution gates.

No live service was paused, no deployment or database mutation ran, EVA was not called, Graph
subscriptions and Outlook items were not changed, and no production Archive content/configuration was
written or retargeted.
