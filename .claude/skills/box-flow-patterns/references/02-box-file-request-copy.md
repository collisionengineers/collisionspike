# Fragment 2 — `box-file-request-copy`

**Wave 2 · plan 04 §7** (reconciled — this is the SINGLE file-request-copy flow; the app transport binds
to `fileRequestUrl`). Request+Response child. Copies the template File Request onto a case's folder and
returns the upload link.

- **Trigger:** Request. **Input:** `{ caseId, fileRequestTemplateId, folderId }`.
- **Gate:** read `cr1bd_BOX_FILEREQUEST_ENABLED`; gate-off → respond `{ outcome:"gated_off" }`.
- **Folder guard (load-bearing):** `if empty(folderId)` → respond `{ outcome:"folder_not_ready" }`.
  **Never call Box with a null `folder.id`.** (Folder existence is guaranteed by `box-folder-create` at
  intake; this flow only READS `cr1bd_boxfolderid`.)
- **Body:**
  1. `CopyFileRequest` (custom connector) — `POST /file_requests/{fileRequestTemplateId}/copy`,
     body `{ folder:{ id: folderId }, status:"active", expires_at?:<ISO8601> }`.
  2. `Audit` → `box_file_request_copied`.
  3. Respond **`{ fileRequestUrl: @outputs('CopyFileRequest')?['body/url'], expiresAt, outcome:"sent" }`**.
- **`outcome ∈ sent | gated_off | folder_not_ready`.** The app shows honest
  `not_connected`/`folder_not_ready`/`error` messages — never a fake link.
- The reg-capture form (`vehicle_registration`) is baked into the template; the copy cannot vary it.
