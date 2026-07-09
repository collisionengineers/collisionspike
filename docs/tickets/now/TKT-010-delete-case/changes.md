# Changes — TKT-010: Delete/remove case with confirm + optional Box-folder removal

## Status
Blocked (operator) — soft-remove + confirm dialog are coded and live enum rows applied; the action is
Superuser-gated and the operator's principal is not yet app-role-assigned `CollisionSpike.Superuser`.

## Commits
- `94902ce` — mega-commit implementing TKT-001..014,019,020 → added the soft-remove case action, the
  confirm dialog, and the supporting status/enum rows.
- `d5e2d4b` — add the 3 missing case Box API routes the SPA calls (Open-in-Box 404 fix) → file
  `api/src/functions/cases.ts`; included the delete/finalize plumbing the delete action depends on.

## Files touched
- `api/src/functions/cases.ts` (delete/finalize plumbing + Box routes).
- SPA delete-case action + confirm dialog with the Box-folder tickbox (within the `94902ce` change set).

## Summary
A soft-remove case action with a confirmation dialog (including the optional "also remove Box folder"
tickbox) is coded and the live enum rows are applied; deletion is audited against the append-only trail.
Per ADR-0017, the Box side is ACK-only — there is no automated Box delete — so the tickbox records an
operator acknowledgement rather than triggering an automated Box folder deletion; reconcile the ticket
text accordingly. The action is Superuser-gated and cannot be exercised until the operator grants the
app-role.
