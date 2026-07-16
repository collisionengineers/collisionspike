# Verification — TKT-010: Delete/remove case with confirm + optional Box-folder removal

## Verdict
BLOCKED (operator)

## Evidence
The soft-remove action and confirm dialog are coded (`94902ce`) and the delete/finalize plumbing landed
in `services/data-api/src/features/cases/` (`d5e2d4b`); the live enum rows are applied. The action is gated on
`CollisionSpike.Superuser`, and the operator's staff principal does not yet hold that app-role — and
assigning an app-role is an access-control change only the operator can make (see staff app-role state in
the registry [live-environment.md](../../../operations/live-environment.md)). Per ADR-0017 Box deletion is
ACK-only (no automated Box delete).

## Pending / gaps
Operator assigns `CollisionSpike.Superuser` to the staff principal. Reconcile the ticket's "removes the
Box folder" wording to ADR-0017's ACK-only stance.

## How to re-verify
As a Superuser, delete a case in the SPA and confirm the soft-remove plus the append-only audit row;
confirm the Box tickbox records an acknowledgement (no automated Box delete).

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

VERIFIED-LIVE. Live: the overflow menu renders exactly "Close case…"; the dialog carries the Close wording + typed confirm + ACK-only archive text (opened and CANCELLED); the implementer's E2E case TE57IMG independently re-observed — chip Closed, banner "Nothing was deleted", every detail + notes intact, absent from the work queues, audit row "Case closed: TE57IMG" 00:24. Code + committed bundle + 9/9 cases-close tests pin withRole(CollisionSpike.User) and the non-destructive UPDATE. Expected absences: a live close by a plain-User principal (only one assigned principal exists, and it is Superuser — directory-gated); direct PG row reads (firewall). Acceptance wording reconciled to the re-scope. Follow-up noted: no in-app reopen affordance (reversible in principle).

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
