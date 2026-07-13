# Verification — TKT-009: Make associated emails clickable + view-full-email link

## Verdict
VERIFIED-LIVE (data linkage)

## Evidence
Both live `inbound_email` rows carry the correct `case_id`:
- case `dc307411` (partial) — email linked to its case.
- case `ca3acf21` = `QDOS26001` (full) — its `inbound_email` also carries `work_provider_id` (`fd5d4720…`); triage routed correctly.
The clickable UI is in the live SPA bundle and now has linked data to act on. Live state in the registry
[live-environment.md](../../../architecture/live-environment.md).

## Pending / gaps
The reopened Outlook work remains `TESTED (offline)` until its PR is merged and the rollout in
`changes.md` is completed. Live proof still needs the DDL and exact merge builds deployed, every managed
Inbox subscription carrying the immutable-id callback marker, one available sample from each production
mailbox, and one deleted/inaccessible saved-preview outcome. The historical backfill must remain a
separate, explicitly approved run.

## How to re-verify
In the deployed SPA, expand an associated email. Confirm the action first checks the current exact
message, `View in Outlook` opens only an available item, and deleted/inaccessible items keep their saved
preview with the plain outcome. Repeat for info@, engineers@ and desk@. Query
`outlook_link_backfill_ledger` separately for historical outcomes and confirm Outlook audit shows no
read/unread, move, delete, category, reply or other mailbox write.
