# Box endpoint surface

All requests carry a server-minted bearer token. Back off on `429` and preserve
the response status for retry decisions.

## Folders

- `POST /2.0/folders` with `{name, parent:{id}}` creates the uppercase Case/PO
  folder. A `409 item_name_in_use` is an idempotency signal; resolve and reuse the
  conflicting folder id.
- `GET /2.0/folders/{id}/items` lists contents. Paginate before comparing items
  with evidence records.
- `PUT /2.0/folders/{id}?fields=shared_link` creates or updates a folder link.

## Files

- `POST /2.0/files/content` uploads bytes.
- `GET /2.0/files/{id}/content` downloads bytes through the server-side function.
- `PUT /2.0/files/{id}?fields=shared_link` creates or updates a file link.

## File requests

- `POST /2.0/file_requests/{templateId}/copy` copies the approved template to a
  case folder and returns the upload URL.
- `GET`, `PUT`, and `DELETE /2.0/file_requests/{id}` read, activate/deactivate,
  or remove the request.

## Webhooks

- `POST /2.0/webhooks` creates a folder webhook for `FILE.UPLOADED`.
- `GET` or `DELETE /2.0/webhooks/{id}` reads or removes it.
- Prefer one webhook on the approved archive root. A duplicate target/app/user
  combination returns `409`.

The application-facing wrapper routes are registered in
`services/functions/box-webhook/function_app.py` and are the stable public surface.
