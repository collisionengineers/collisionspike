# Delete one case image — deploy, operate and verify

This runbook is the TKT-160 boundary for the staff-confirmed **Delete image** action. It is not a
retention sweep or whole-case erasure path. Live verification may touch only a designated test case
whose Archive folder is inside test root `392761581105`; every other Archive location is read-only.

## Invariants

- The authenticated staff route is `DELETE /api/cases/{caseId}/images/{evidenceId}`.
- Only image-kind evidence owned by that exact active case is eligible.
- The durable `evidence_deletion` intent and `image_deletion_requested` audit exist before Blob/Archive
  deletion begins. They record identifiers and outcomes, never image bytes.
- An Archive file is addressed only by the evidence row's persisted `box_file_id`. The Box Function
  freshly validates that its direct parent is the case's persisted `box_folder_id` inside the configured
  read-write root. It never searches by name/path and never deletes a folder.
- Archive resolves before Blob. If Archive scope or deletion fails, Blob is untouched.
- `deleted`, `missing`, and `not_required` are resolved store outcomes. The active evidence row is
  removed only when both stores resolve; partial failure stays visible as **Finish deleting**.
- Source email/document, sibling evidence, case folder and files outside the configured read-write root
  are never deletion targets.
- A tombstone suppresses only replay of the same per-file Blob path or Archive file ID. An email
  Message-ID is contextual source evidence, never a replay key by itself, because sibling attachments
  share it. A later explicit upload with a new identity remains allowed, including identical bytes.

## Deployment order

Do not expose the UI against an older API/schema. Deploy in this order:

1. Apply `database/migrations/2026-07-13-tkt160-evidence-deletion.sql` to Postgres.
2. Publish `services/functions/box-webhook/` so `GET|DELETE /api/box/files/{fileId}?folderId=...` exists.
3. Publish `services/data-api/` with `deleteCaseImage` and the replay/mirror/classification guards.
4. Build and publish `apps/web/`.
5. Hard-refresh the SPA and confirm the deployed asset contains **Delete image**.

If any of steps 1–3 fails, do not publish the SPA. The new columns/table are additive and may remain
while the prior API runs. Do not drop deletion intents/tombstones as rollback cleanup.

## Safe offline gate

From the repository root:

```powershell
npm run build
npm run test --workspace @cs/api
npm run test --workspace @cs/web
python -m pytest -q services/functions/box-webhook/tests
node verify-all.mjs
```

The focused acceptance suites are
`services/data-api/src/features/cases/evidence-delete.test.ts`,
`apps/web/src/data/rest-client.test.ts`,
`services/functions/box-webhook/tests/test_scope_lock.py`, and
`services/functions/box-webhook/tests/test_file_deletion_routes.py`.

## Designated test-folder proof

Before mutation, record the test case ID, evidence ID, filename, Blob path, Box file ID, case folder ID,
current status/readiness, sibling evidence IDs, and case-folder child IDs. Confirm the folder descends
from `392761581105`. Stop if any identity is blank/ambiguous or the folder is outside that test root.

1. In the SPA, open the test case Evidence tab and select **Delete image** on the chosen file.
2. Confirm the dialog names that filename and says the Archive copy is removed while the source remains.
3. First cancel. Prove there is no `evidence_deletion` row/audit/store mutation.
4. Reopen and confirm. Observe success only after the request returns 200.
5. Read back all stores:
   - active `evidence` has no selected ID; every captured sibling ID remains;
   - `evidence_deletion` is `completed` with resolved Blob/Box outcomes and no byte content;
   - audit contains requested (`100000063`) then deleted (`100000065`) with actor and identifiers;
   - the selected Blob and exact Box file are absent, while the case folder/source/siblings remain;
   - the SPA image grid/order/EVA selection omit the image and status/readiness reflect the new set.
6. Repeat the DELETE against the same IDs. It must return completed/repeated without another store
   deletion.
7. Replay the original automatic evidence descriptor. It must report `suppressed` and leave no recreated
   active/store copy. Upload the same bytes explicitly under a new identity and prove a new evidence row
   is allowed and audited.

## Partial failure and recovery

When a store call or finalization fails, the API returns non-2xx and never claims completion. The image
remains on the case with `deletionPending=true`; review/classification/archive-mirror/merge work cannot
race it. The staff member selects **Finish deleting** to retry the same durable operation. Already
resolved stores are not repeated. If the Archive file or case folder changes before any copy is deleted,
the API cancels the intent, clears the image marker and returns `deletionPending=false`; refresh before
starting a new confirmed deletion. A cancelled intent is safely reactivated with a fresh snapshot on a
later request and is not used to suppress source replay. Replay cleanup is enabled per store only after
that store's outcome is durably recorded as deleted or missing.

Use `evidence_deletion.last_failure_code`, `attempt_count`, per-store outcomes and the
`image_deletion_failed` (`100000064`) audit to diagnose. A `case_update` failure leaves both resolved
store outcomes unchanged so retry resumes at finalization without misreporting a store failure. An
Archive scope mismatch is fail-closed and cancels safely when no copy was deleted; never substitute a
name/path lookup or broaden the allowed root. A transient 503 is retryable. If Archive already resolved
before a case-folder relink, recovery continues from the durable original scope without repeating that
store. If stores resolved but finalization did not,
retry the route; do not manually delete the evidence/tombstone rows.

## Evidence to attach to ticket verification

Record command/test output, deployed resource versions, before/after database selects, Box/Blob
readbacks, the cancelled and confirmed UI states, recomputed queue/status, and audit rows. Redact secret
values but retain IDs needed to prove exact scope. Only the ticket verifier may record the final verdict
or move TKT-160 from `verify` to `done`.
