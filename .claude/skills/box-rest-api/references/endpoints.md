# Box REST endpoints — request/response field detail

Field-level depth for the unified operations in `SKILL.md`. Re-read **developer.box.com** +
`automationsresearch/box/markdown` for exhaustive schemas; this is the distilled surface the pivot uses.

## CreateFolder — `POST /2.0/folders`
- Body: `{ "name": "<UPPERCASE Case/PO>", "parent": { "id": "<BoxArchiveRootId>" } }`.
- `201` → `{ id, name, parent, ... }`. Stamp `id` → `cr1bd_boxfolderid`.
- `409 item_name_in_use` → folder already exists; treat as idempotent success. The conflicting id is in
  `context_info.conflicts[0].id` — read it back rather than failing. Box folder names are
  **case-insensitive** for collision, so `AX26001` and `ax26001` collide.

## CopyFileRequest — `POST /2.0/file_requests/{templateId}/copy`
- The **only** create path (no create-from-scratch). Body: `{ "folder": { "id": "<folderId>" },
  "status": "active", "expires_at": "<ISO8601, optional>" }`.
- `200` → the new File Request `{ id, url, folder, status, ... }`. `url` is the public upload link →
  return as `fileRequestUrl`. The capture form (incl. the `vehicle_registration` metadata field) is
  **baked into the template** and cannot be varied by copy.
- One File Request per folder (a second copy onto the same folder is a duplicate).

## GetSharedLink / GetFolderSharedLink — `PUT /2.0/files/{id}?fields=shared_link` · `PUT /2.0/folders/{id}?fields=shared_link`
- Two **separate operationIds** (the connector + connection-reference + Code App split file vs folder):
  `GetSharedLink` = the **file** variant (`PUT /2.0/files/{id}`); `GetFolderSharedLink` = the **folder**
  variant (`PUT /2.0/folders/{id}`). The generated `*Service` method names equal these.
- Body (identical for both): `{ "shared_link": { "access": "<open|company|collaborators>",
  "permissions": { "can_download": true } } }`. Returns `shared_link.url` (+ `shared_link.download_url`
  for files).
- "Open in Box" surfaces the **folder** link (`GetFolderSharedLink`); the (not-pursued) iframe embed
  would need that folder link's `/embed/s/{token}` form.

## ListFolder — `GET /2.0/folders/{id}/items?fields=id,name,created_at,modified_at`
- Reconciliation sweep (the webhook fallback). Paginate with `limit`/`offset` (or marker). Compare
  against Dataverse Evidence rows to detect dropped `FILE.UPLOADED` events.

## CreateWebhook — `POST /2.0/webhooks`
- Body: `{ "target": { "id": "<folderId>", "type": "folder" }, "address": "<https endpoint>",
  "triggers": ["FILE.UPLOADED"] }`. Prefer one webhook on the **archive root** over per-case.
- `409` if a duplicate target+app+user webhook already exists.
- Lifecycle: `GET /2.0/webhooks/{id}`, `DELETE /2.0/webhooks/{id}`, `GET /2.0/webhooks` (list).

## File-Request lifecycle — `GET` / `PUT` / `DELETE /2.0/file_requests/{id}`
- `PUT` with `{ "status": "inactive" }` deactivates (stops uploads) without deleting; `"active"`
  re-enables. `DELETE` removes it. `GET` reads current state.

> All calls carry `Authorization: Bearer <CCG token>` minted in the Function (never the connector).
> Rate limits: ~1000/min/user (Box) and ~100/connection/60s (connector) — back off on `429`.
