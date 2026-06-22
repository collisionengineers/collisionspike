# Fragment 2 — `box-file-request-copy`

**Wave 2 · plan 04 §7** (reconciled — this is the SINGLE file-request-copy flow). **STANDBY child** —
authored for **future operator activation**, **NOT currently invoked by the Code App**: under CSP
`connect-src 'none'` the Code App **cannot POST to a flow Request URL**, so it calls the Box REST
connector op (`CopyFileRequest`) **DIRECTLY** (the pinned 2026-06-21 build-plan decision; the direct
transport must also persist `cr1bd_boxfilerequestid`/`url` on the case at activation). This Request+
Response child stays authored as the operator-activatable alternative. It copies the template File
Request onto a case's folder and returns the upload link.

- **Trigger:** Request. **Input:** `{ caseId, fileRequestTemplateId, folderId }`.
- **Gate:** read `cr1bd_BOX_FILEREQUEST_ENABLED`; gate-off → respond `{ outcome:"gated_off" }`.
- **Folder + template guard (load-bearing):** `if empty(folderId) OR empty(templateId)` →
  respond `{ outcome:"folder_not_ready" }`. **Never call Box with a null `folder.id`** *or* an empty
  `fileRequestTemplateId` (the template id is the `/file_requests/{id}/copy` PATH param — empty would hit
  Box with an empty file-request path). Folder existence is guaranteed by `box-folder-create` at intake;
  this flow only READS `cr1bd_boxfolderid`; the template id is the operator-set
  `cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID` (empty until activation).
- **Body:**
  1. `CopyFileRequest` (custom connector) — `POST /file_requests/{fileRequestTemplateId}/copy`,
     body `{ folder:{ id: folderId }, status:"active", expires_at?:<ISO8601> }`.
  2. Stamp `cr1bd_boxfilerequestid` + `cr1bd_boxfilerequesturl` on the case.
  3. `Audit` → `box_file_request_copied`.
  4. Respond **`{ fileRequestUrl: @outputs('CopyFileRequest')?['body/url'], expiresAt, outcome:"sent" }`**.
- **`outcome ∈ sent | gated_off | folder_not_ready`.** The app shows honest
  `not_connected`/`folder_not_ready`/`error` messages — never a fake link.
- The reg-capture form (`vehicle_registration`) is baked into the template; the copy cannot vary it.
