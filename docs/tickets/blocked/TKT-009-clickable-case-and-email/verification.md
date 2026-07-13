# Verification — TKT-009: Make associated emails clickable + view-full-email link

## Verdict
- Original case/email data linkage: **VERIFIED-LIVE** (historical evidence below).
- Reopened Outlook-link rollout and final cutover readiness: **PENDING / BLOCKED**.

## Evidence
Both live `inbound_email` rows carry the correct `case_id`:
- case `dc307411` (partial) — email linked to its case.
- case `ca3acf21` = `QDOS26001` (full) — its `inbound_email` also carries `work_provider_id` (`fd5d4720…`); triage routed correctly.
The original clickable preview is in the live SPA bundle and has linked data to act on. This evidence
does not verify the reopened exact-Outlook-link implementation, its subscription change or a production
cutover. Current live state belongs in the registry
[live-environment.md](../../../architecture/live-environment.md).

## Pending / gaps
The reopened Outlook work remains `TESTED (offline)`. PR #86 is merged, and its additive Phase-A schema
is present, but the attempted API deployment was restored to the pre-PR-86 runtime and the final
mailbox-key delta was not applied. The orchestration/SPA rollout, controlled legacy subscription
delete/recreate, historical backfill approval and signed-in Chrome proof have not occurred. No Graph
subscription was changed, no Outlook item was mutated, no production Archive root was retargeted or
written, and EVA was not queried.

TKT-009 feeds the TKT-178 final production cutover and does not have a separate live-execution window.
The following are mandatory gates before either its production rollout or the final cutover can execute:

- dated, signed-off job spreadsheet with its checksum and named approval;
- independently confirmed production Archive root plus explicit production retarget/write
  authorization (Archive access remains test-root-only until then);
- deterministic zero-write dry-run ledger with a frozen SHA-256 hash and approval of that exact hash;
- checksum-verified backups/inventories and successful restore proof against a non-production copy;
- authenticated, available EVA API with successful production evidence. The API is currently
  blocked/unavailable, so the dry-run must record EVA as `not queried` with the reason and make no
  request; **production execution cannot proceed**;
- operator approval for the final frozen job, bounded pause, subscription replacement and every
  production mutation.

Outlook is read-only throughout. The historical backfill remains a separate, explicitly approved run.
An input, ledger or hash change invalidates the approval and returns the cutover to dry-run.

## How to re-verify
1. Attach the signed spreadsheet/hash, approved production Archive target and write authorization,
   frozen dry-run hash, backup manifests, successful restore rehearsal, EVA authentication/availability
   proof and named operator approval. Do not start production execution while any artifact is absent.
2. Deploy the exact approved database, orchestration, API and SPA builds. Before deletion, persist an
   Inbox delta checkpoint and prove the legacy queue/Durable path drained to a recorded watermark. Use a
   durable one-mailbox operation ledger and idempotent per-message outbox; re-list after ambiguous Graph
   creation and restore coverage immediately if no replacement exists. Reconcile the saved delta and
   every acknowledged outbox/database result before intake resumes. A timestamp/current-folder scan or
   one array queue-output call is not sufficient proof.
3. In the deployed SPA, expand an associated email. Confirm the action checks the current exact message,
   `View in Outlook` opens only an available item, and deleted/inaccessible items keep their saved
   preview with the plain outcome. Repeat for info@, engineers@ and desk@.
4. Query `outlook_link_backfill_ledger` separately for approved historical outcomes and confirm Outlook
   audit shows no read/unread, move, delete, category, reply or other mailbox write.
5. Independently reconcile the execution ledger, Archive/database before-and-after evidence, all
   notification-gap messages and rollback checkpoints before changing the verdict.
