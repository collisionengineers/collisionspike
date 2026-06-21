# Fragment 5 — `box-blob-purge`

**Wave 5 · plan 04 §11.** Scheduled, status-driven Blob cleanup. Box is the archive of record; Blob is
the transient working store. Purge is **status-driven, never a blind age rule** (Blob lifecycle policies
can't read Dataverse status).

- **Trigger:** `Recurrence` — **include a `startTime`** so it does not fire on deploy.
- **Param:** `PurgeGraceDays` default **7** (operator may pin 7/30/60).
- **Gate:** read `cr1bd_BOX_API_ENABLED`; gate-off → no-op.
- **Body:**
  1. `ListRecords` cr1bd_cases where `cr1bd_status eq box_synced (100000009)` **AND**
     `cr1bd_boxsyncedat < addDays(utcNow(), -PurgeGraceDays)`. *(This `status`+`boxsyncedat` ListRecords
     is the **documented linter exception** for `validate-flows.mjs`.)*
  2. For each → for each Blob evidence row → `DeleteFile_V2` (first-party `shared_azureblob`).
     **NEVER delete the Box copy.** Leave the `cr1bd_evidence` row; clear/flag its `cr1bd_storagepath`.
  3. Audit the purge.
- **Backstop:** a tag-filtered Blob lifecycle rule (with soft-delete on) as a cheap secondary — but the
  flow (which re-checks Dataverse) is primary.
