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
  2. For each case → list **only the archived IMAGE evidence** that still references Blob bytes:
     `cr1bd_kind eq 100000000 AND cr1bd_acceptedforeva eq true AND cr1bd_excluded eq false AND
     cr1bd_storagepath ne null`. finalize-eva-box uploads **exactly this set** to Box, so only it is safe
     to purge. **Non-image / non-accepted / excluded** Blob bytes (instructions, `.eml`, valuation,
     rejected images) are intentionally **RETAINED** — full-artifact Box archival + their purge is a
     **deferred follow-up**; purging them by storagepath alone would be permanent loss of bytes never
     archived.
  3. For each such row → resolve the Blob id from its path, then `DeleteFile_V2` (first-party
     `shared_azureblob`) — **only when the id resolved (`Succeeded`)**. **NEVER delete the Box copy.**
  4. **Clear `cr1bd_storagepath` only on a confirmed delete (`Succeeded`) or already-gone (`Skipped`)**
     outcome — NOT on `Failed` (a transient 429/5xx leaves the blob present, so clearing would orphan it
     and write a false "purged" audit; leaving the pointer set lets the next run retry). Leave the
     `cr1bd_evidence` row; only the dead Blob pointer is cleared.
  5. Audit the purge (per-case, on all outcomes).
- **Backstop:** a tag-filtered Blob lifecycle rule (with soft-delete on) as a cheap secondary — but the
  flow (which re-checks Dataverse) is primary.
