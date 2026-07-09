# Verification — TKT-010: Delete/remove case with confirm + optional Box-folder removal

## Verdict
BLOCKED (operator)

## Evidence
The soft-remove action and confirm dialog are coded (`94902ce`) and the delete/finalize plumbing landed
in `api/src/functions/cases.ts` (`d5e2d4b`); the live enum rows are applied. The action is gated on
`CollisionSpike.Superuser`, and the operator's staff principal does not yet hold that app-role — and
assigning an app-role is an access-control change only the operator can make (see staff app-role state in
the registry [live-environment.md](../../../architecture/live-environment.md)). Per ADR-0017 Box deletion is
ACK-only (no automated Box delete).

## Pending / gaps
Operator assigns `CollisionSpike.Superuser` to the staff principal. Reconcile the ticket's "removes the
Box folder" wording to ADR-0017's ACK-only stance.

## How to re-verify
As a Superuser, delete a case in the SPA and confirm the soft-remove plus the append-only audit row;
confirm the Box tickbox records an acknowledgement (no automated Box delete).
