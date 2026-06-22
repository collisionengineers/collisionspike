# Fragment 1 — `box-folder-create`

**Wave 1 · plan 04 §5.** Request+Response **child** flow. Mints the one UPPERCASE Case/PO Box folder at
parse-confirm. Idempotent. (Byte-exact JSON finalizes against the authored connector; op-names are
pinned by the 00-BUILD-PLAN reconciliation table.)

- **Trigger:** Request (manual/HTTP child). **Input:** `{ caseId, casePo, workProviderId? }`.
  *(Decide whether `workProviderId` is load-bearing inside the child; if not, drop it so the merged-case
  path passing `''` is unambiguous — 04 conflict.)*
- **Param:** `BoxArchiveRootId` ← env-var `cr1bd_BOX_FOLDER_ROOT_ID`.
- **Gate:** read `cr1bd_BOX_FOLDER_AT_INTAKE_ENABLED`; gate-off → respond `{ outcome:"gated_off" }`.
- **Idempotency guard:** if `cr1bd_boxfolderid` already set → no-op respond `{ outcome:"exists" }`.
- **Body:**
  1. `CreateFolder` (custom connector, placeholder connection-ref) — `name=@toUpper(triggerBody()?['casePo'])`,
     `parent.id=@parameters('BoxArchiveRootId')`. The connector facade **swallows Box 409**
     (`item_name_in_use`) and returns the existing folder id (case-insensitive collision).
  2. `Update_case` → stamp `cr1bd_boxfolderid` = `@outputs('CreateFolder')?['body/id']` + `cr1bd_boxsyncedat`.
  3. `Audit` → `box_folder_created`.
  4. Respond `{ outcome:"created", boxFolderId }`.
- **House rules:** gate is READ not defined; audit every branch; connection-ref via placeholder; the
  folder NAME is the UPPERCASE Case/PO (not all-digits → linter `BOX_ID_LITERAL_RE` targets
  `parent_id|folder_id`, not `name`).
