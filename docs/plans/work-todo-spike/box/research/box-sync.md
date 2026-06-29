# Box sync research

## Ticket

Source stub: `docs/plans/work-todo-spike/box/box-sync.md`

> ".eml, images, instructions all not making it to box. The folder itself is getting created but key files not stored."

## Short finding

The current source can create a Box folder and can record evidence rows, but it does not implement the missing bridge: copying the already-landed email evidence from Blob into the case Box folder and stamping the resulting Box file ids/links back onto `evidence`.

The live settings make this more visible: `BOX_API_ENABLED`, `BOX_FOLDER_AT_INTAKE_ENABLED`, and `BOX_FILEREQUEST_ENABLED` are all true on `cespk-orch-dev`, and the deployed Box functions exist. That means folder/file-request features may run, but the source still lacks a file-upload facade route and an archive-copy activity.

## Evidence

- Live read-only Azure CLI on 2026-06-29 showed `cespk-orch-dev` has `BOX_API_ENABLED=true`, `BOX_FOLDER_AT_INTAKE_ENABLED=true`, `BOX_FILEREQUEST_ENABLED=true`, `BOX_FOLDER_ROOT_ID=392761581105`, and `BOXWEBHOOK_FN_URL=https://cespkbox-fn-v76a47.azurewebsites.net`.
- Live read-only Azure CLI showed deployed orchestration functions include `box-folder-create-start`, `boxFolderCreate`, `box-file-request-copy-start`, `boxFileRequestCopy`, `boxBlobPurgeOrchestrator`, and `finalizeEvaBoxOrchestrator`.
- Live read-only Azure CLI showed `cespkbox-fn-v76a47` exposes `create_folder`, `copy_file_request`, `get_shared_link_file`, `get_shared_link_folder`, `list_folder`, webhook lifecycle routes, and `box_webhook`. It does not expose an upload function.
- The main intake chain lands message attachments, resolves/creates the case, persists evidence rows, parses, evaluates status, and enriches. It does not call Box folder creation, file-request copy, or archive upload: `orchestration/src/functions/intakeOrchestrator.ts:70-87`.
- Intake evidence persistence writes Blob-backed rows through `classifyPersist`: `orchestration/src/functions/activities/classifyPersist.ts:30-61`.
- The internal evidence API has two shapes. Email/orchestration rows store `storage_path` only; Box-originated rows store `source_message_id`, `box_file_id`, and `box_file_url`: `api/src/functions/internal.ts:520-618`.
- The schema supports both sides of that mirror: `evidence.storage_path`, `evidence.box_file_id`, and `evidence.box_file_url` exist in `migration/assets/schema/060_evidence.sql:23-27`.
- The case table has Box folder/file-request fields, but source folder creation currently only creates the folder and audits it: `migration/assets/schema/050_case.sql:53-58`, `orchestration/src/functions/gated/box-folder-create.ts:52-59`.
- Webhook upload resolution depends on `case_.box_folder_id`; without stamping the folder id onto the case, Box uploads cannot be reliably mapped back to the case: `api/src/functions/internal.ts:769-789`.
- The Box facade client only wraps folder creation, file-request copy, folder listing, and shared links: `orchestration/src/lib/functions-client.ts:116-131`.
- The Python Box function facade likewise exposes folder/file-request/shared-link/list/webhook routes but no `files/content` upload route: `functions/box-webhook/function_app.py:143-247`.
- `finalize-eva-box` does not archive existing evidence. In current source it submits EVA, then creates another folder named by `caseId` and audits `box_synced`: `orchestration/src/functions/gated/finalize-eva-box.ts:42-68`.
- The Box webhook records files uploaded into Box or a File Request as Box-origin evidence rows. It does not mirror original email blobs into Box: `functions/box-webhook/function_app.py:263-320`, `api/src/functions/internal.ts:568-599`.
- Microsoft Graph supports fetching full message MIME with `GET /users/{id}/messages/{id}/$value`; current intake fetches message JSON and attachments, not a raw `.eml` artifact. Source: Microsoft Learn, "Get message" (`https://learn.microsoft.com/graph/api/message-get?view=graph-rest-1.0`).

## Where the gap comes from

There are three separate file paths that look related but are not equivalent:

1. Email intake stores original attachments in Blob and records `evidence.storage_path`.
2. Box File Request uploads arrive from Box webhooks and record Box-origin evidence rows.
3. Box folder creation creates an empty case folder.

The missing piece is a one-way archive mirror from path 1 into path 3. Without it, the symptom is exactly what the ticket says: the folder may exist, while `.eml`, images, and instruction documents do not appear in it.

The `.eml` part is an additional gap. The current intake path can store an email-body text artifact when there is no instruction attachment, but it does not fetch the raw MIME message and persist it as an email evidence row. Microsoft Graph supports that through `$value`; the repository does not currently use it in the intake chain.

## Files affected by a fix

- `orchestration/src/functions/intakeOrchestrator.ts` - should call a folder ensure/archive step after evidence persistence or at the parse-confirm/finalize boundary.
- `orchestration/src/functions/gated/box-folder-create.ts` - should stamp/reuse `case_.box_folder_id` and `case_.box_folder_url`, not only audit.
- `orchestration/src/functions/gated/finalize-eva-box.ts` - should augment the existing case folder and archive evidence; it should not create a new folder named by raw `caseId`.
- `orchestration/src/lib/functions-client.ts` - needs a Box upload facade method if Box uploads remain isolated behind the Python function.
- `functions/box-webhook/function_app.py` and `functions/box-webhook/box_client.py` - need a scoped upload route/method for existing Blob-backed evidence.
- `api/src/functions/internal.ts` - needs internal routes to list archive candidates for a case, stamp case folder fields, and update evidence Box ids/links after upload.
- `orchestration/src/lib/graph.ts` and `orchestration/src/functions/activities/fetchMessage.ts` - need raw MIME capture for receiving-work cases if `.eml` must be archived.
- `migration/assets/schema/060_evidence.sql` and `migration/assets/schema/900_constraints.sql` - may need partial unique indexes for idempotency over `(case_id, storage_path)`, `(case_id, source_message_id)`, and `(case_id, box_file_id)`.
- `mockup-app/src/data/box-rest-transport.ts` and `api/src/index.ts` / route modules - the SPA expects public Box routes for shared links, file-request copy, and finalize, but current API source mainly exposes Box gates.

## Resolution shape

1. Reconcile source/live drift first. Several docs and reports mention folder-stamping routes, but current local source only has `internal/box/case-by-folder`, purge candidates, and mark-purged routes.
2. Add an idempotent folder ensure/stamp flow:
   - read existing `case_.box_folder_id`;
   - create folder only if absent;
   - write `box_folder_id` and `box_folder_url` first-wins;
   - audit the result.
3. Add a Box upload facade:
   - upload bytes to a target case folder using Box file upload;
   - scope-check target folders under the configured root;
   - return file id and shared/open link.
4. Add an archive-copy activity:
   - read evidence rows for the case where `storage_path IS NOT NULL` and `box_file_id IS NULL`;
   - download bytes from Blob;
   - upload each item to the stamped Box folder;
   - update `evidence.box_file_id` and `evidence.box_file_url`;
   - set `case_.box_synced_at` only after the required archive set succeeds.
5. Capture the raw email:
   - fetch message MIME through Graph `$value`;
   - store it as `message.eml` in Blob;
   - persist it as email evidence;
   - include it in archive-copy.
6. Decouple Box archival from EVA submission. Box sync should not depend on `EVA_API_ENABLED`; EVA submit and archive mirror are separate outcomes.
7. Add regression coverage for one email with a PDF and images:
   - creates/reuses the case folder;
   - archives `.eml`, instruction, and images;
   - records Box file ids/links;
   - remains idempotent on retry.

## Open checks before implementation

- Confirm whether the deployed live code contains folder-stamping routes not present in this checkout.
- Confirm whether `BOX_FILE_REQUEST_TEMPLATE_ID` is configured live; the source no-ops file-request copy when it is empty.
- Confirm desired timing: archive immediately after evidence persistence, at parse-confirm, or only at finalize. The ticket implies users expect it before/far earlier than final EVA submit.
