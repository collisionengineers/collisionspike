# Verification — TKT-142: Box facade 502s on large base64 payloads — QDOS26029 archive stranded (17.6 MB .eml)

## Verdict
VERIFIED-LIVE

Verified by: ticket-verifier dispatch, 10-07-26 (verdict block transcribed 1:1 below). One
formality SQL (case stamp check) rides the orchestrator W2 data pass.

## Ticket-verifier verdict (transcribed 1:1, dispatch of 2026-07-10)

### Verdict
VERIFIED-LIVE

### Evidence

**Acceptance 1 — the 17.6 MB .eml archives to Box through the facade.**
App Insights `cespike-parser-ai-dev` (box fn traces, 2026-07-09T09:43:53Z): `Executing
'Functions.upload_file'` → `GET https://cespkevidstdev01.blob.core.windows.net/evidence/AAMk…/message.eml
"HTTP/1.1 200 OK"` → `evidence blob fetched for upload (bytes=17684171)` — the new blobPath/MI-streamed
lane live, not base64 — → Box `POST /2.0/files/content` (409-idempotent-resolved per the TKT-087 sha1
rule) → facade request `upload_file 200` (4219 ms) to folder `396125774315`. Box read (keyed facade GET
`…/api/box/folders/396125774315/items`, inside allowed root `392761581105`): `message.eml |
size=17684171 | id=2323068184378 | sha1=ecaa3fd3…` present; root lookup resolves `396125774315 →
name=QDOS26029`. (Cap path also honest: legacy base64 lane retained with a 413-before-decode cap —
offline-tested; nothing live sends oversized base64 anymore since orch routes >8 MiB via blobPath.)

**Acceptance 2 — the stranded ae1c0c84/QDOS26029 archive completes 4/4.**
App Insights `cespk-orch-dev` (2026-07-09): request `box-archive-start` **202** at 09:43:48Z → durable
instance `437c002e1aad439395e8fc2f518e4d6c`: `boxArchiveEvidenceOrchestrator started` 09:43:51Z →
activity + orchestrator **`State: Completed. RuntimeStatus: Completed`** 09:44:04Z, `Output: (Redacted
24 characters)` — exactly the length of `{"uploaded":4,"total":4}` (the verbatim output is in
changes.md's caller-side readback). Box fn side: **4** `upload_file 200`s into `396125774315`
(=QDOS26029) at 09:43:53/57/58/09:44:01Z. Registry corroborates: `LIVE_FACTS.json` (2026-07-10
verifiedBy) records "TKT-142 PROVEN LIVE … durable Completed {uploaded:4,total:4} (was 0/4)".

**Acceptance 3 — no small-file collateral during the large upload.**
KQL window 09:40–09:50Z on the box fn: every request 200 (list_folder + all 4 uploads + webhooks),
zero 4xx/5xx. Day-wide non-2xx sweep (2026-07-09, ~430 uploads): only two events, both outside the
archive and unrelated — 12:12:06 `upload_file 400` (honest contract rejection) and 18:57:02
`upload_file 502` (see gaps).

**Wiring readbacks (changes.md claims re-read live):** `cespkbox-fn-v76a47` app settings
`EVIDENCE_BLOB_ACCOUNT=cespkevidstdev01`, `EVIDENCE_BLOB_CONTAINER=evidence`,
`BOX_ALLOWED_ROOT_ID=392761581105`; ARM GET of role assignment `25c7bca6-…` on `cespkevidstdev01` →
principal = box fn MI, role Storage Blob Data Reader — all match changes.md. Box fn still 12 functions.

### Pending / gaps
**Expected absences (not bugs):**
- The **≥20 MiB Box chunked-session lane is offline-mocked only** (no live file that size exists; the
  Acceptance does not require a ≥20 MiB live proof — the subject 17.6 MB file correctly exercised the
  direct-stream lane). Matches changes.md's Remainders.
- The legacy-lane 413-before-decode cap has no live occurrence to observe — offline-tested.
- DB stamp check queued for the orchestrator data pass:
  `SELECT c.case_po, c.box_folder_id, e.file_name, e.size_bytes, e.box_file_id FROM case_ c JOIN
  evidence e ON e.case_id = c.id WHERE c.id = 'ae1c0c84-ba0c-4049-be73-c149b46c2ffa' ORDER BY
  e.created_at;` (expect box_folder_id 396125774315; message.eml 17684171 / 2323068184378).

**Watch-item (real, outside this ticket's acceptance):** one isolated `upload_file` 502 at 18:57:02Z
(folder 398319306472) — a Box-side 400 surfacing as a gateway 502 during a host-recycle minute
(StartupCount=3), 200s bracketing it. Cosmetic error-mapping candidate for a follow-up ticket.

### How to re-verify
1. Orch component KQL: `union traces, requests | where message has "437c002e1aad439395e8fc2f518e4d6c"
   or name has "box-archive"` over 2026-07-09 (retention permitting).
2. Box fn component KQL 09:40–09:50Z: `evidence blob fetched for upload (bytes=17684171)` + the 4
   `upload_file 200`s.
3. Durable proof independent of log retention: keyed facade GET
   `/api/box/folders/396125774315/items` → message.eml size=17684171; root listing maps the folder to
   QDOS26029.
4. Readbacks: app settings + the role assignment.
5. The queued SQL at the next sanctioned data pass.

### Confidence + unread surfaces
High. Unread: Postgres (queued); the durable output string is redacted in host traces (corroborated by
the 24-char redaction length + 4 observed 200s); the ≥20 MiB chunked lane has never run live anywhere.

## Orchestrator data-pass W2 — pending

The queued case-stamp SQL runs in the W2 batched window; result appended here.
