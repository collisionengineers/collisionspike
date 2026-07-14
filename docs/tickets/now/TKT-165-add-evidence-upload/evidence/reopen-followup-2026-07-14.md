# TKT-165 live failure and reopen follow-up — 2026-07-14

## Why this ticket is reopened

The deployed Add evidence route is actively broken. The only authenticated live upload observed in
the verification window submitted four files and returned HTTP 400 for all four because strict audit
insertion referenced missing lookup value `choice_audit_action.code = 100000049`
(`evidence_added`). The same transaction contains the evidence, Archive outbox, readiness and audit
writes, so the foreign-key failure prevents the entire upload from committing. Subsequent successful
cleanup calls removed the failed-attempt artifacts; they do not prove an upload succeeded.

The fresh-build canonical schema contains `100000049`, but the deployable live migration sequence
does not. In particular, `2026-07-12-tkt165-staff-evidence-upload.sql` creates the upload tables and
indexes without inserting that audit lookup. An already-created live database therefore remains
missing the value.

## Required repair

1. Add an idempotent, append-only live delta for the exact controlled audit value and cover delta
   replay in migration tests.
2. Apply the reviewed delta through the normal deployment path and read the row back before invoking
   the route again.
3. Use only an explicitly designated test case and harmless files, with every Archive write beneath
   test root `392761581105`.
4. Prove one successful JPG/PDF batch end to end: response identities, database evidence and exact
   audit, retained Blob, Archive mirror, classification/readiness and UI rendering.
5. Prove replay/double-click idempotency, mixed failure/retry, stale/terminal/unauthorized refusal,
   keyboard access, narrow layout and true 200% zoom.

## Safety boundary

This repair is not the production cutover. It does not authorize a production Archive-root switch,
EVA call, service pause, Graph subscription mutation, final cutover DDL or any write outside the
pinned test root.
