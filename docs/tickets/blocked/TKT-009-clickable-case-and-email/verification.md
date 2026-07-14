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

## Independent PLAN-005 sweep update — 2026-07-14

### Verdict

PENDING / BLOCKED — keep blocked. The original internal-preview acceptance is historically
VERIFIED-LIVE, but the reopened exact-Outlook-link work is merged and tested offline only; it is not
deployed, cut over or verified live.

### Evidence

- Original internal-preview acceptance remains historically verified by linked live case/email rows.
- PR 86 merged as `f419e31599cdf25cac3d8b4bc66362683b494a05` on 2026-07-13 with successful
  recorded checks.
- Acceptance 1 — PENDING live: PR 86 implements `View in Outlook`, but production
  `/assets/index-CbUqeEAY.js` does not contain that label. API was restored pre-PR86 and
  orchestration/SPA stayed unchanged.
- Acceptances 2–6 — TESTED offline: immutable Graph identity and authoritative `message.webLink`,
  HTTPS/expected-host validation, `noopener noreferrer`, fresh read-only exact-message check and
  plain saved-preview fallback are implemented.
- Acceptance 7 — TESTED offline: focused/full suites include info@, engineers@ and desk@ plus link
  policy/fallback coverage.
- Acceptance 8 — PENDING: no deployed signed-in proof for all three mailboxes or
  deleted/inaccessible outcome.
- Acceptance 9 — BLOCKED: signed spreadsheet, production Archive authorization, approved frozen
  dry-run hash, backup/restore proof, authenticated EVA access and final operator approval are absent.
- Phase-A additive schema exists; final mailbox-key delta, deployment, subscription replacement,
  historical backfill and signed-in proof have not occurred.

### Pending / gaps

- Every mandatory TKT-178 input/approval gate.
- Final mailbox-key cutover and approved API/orchestration/SPA rollout.
- Controlled per-mailbox subscription replacement/reconciliation.
- Separately approved historical backfill.
- Signed-in read-only proof for each production mailbox and a deleted/inaccessible item.
- Independent zero-Outlook-mutation proof.

### How to re-verify

1. Do not begin production work until all ticket gate artifacts and named approvals exist.
2. After approval, execute only the frozen TKT-178 sequence with checkpoint, drain, operation ledger,
   outbox, reconciliation and rollback evidence.
3. Verify one available sample from each production mailbox plus deleted/inaccessible fallback.
4. Prove host, exact mailbox/message identity, opener protection, fallback and no mailbox mutation.
5. Independently reconcile ledger, database/Archive evidence, notification gap and rollback before
   changing verdict.

### Confidence + unread surfaces

**High confidence in the blocked verdict.** Complete ticket, PR metadata, source/tests and current live
SPA were inspected. PostgreSQL, Graph, Outlook, EVA, production Archive, final DDL and subscription
state were intentionally untouched.
