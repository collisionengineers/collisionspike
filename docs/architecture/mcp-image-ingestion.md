# Registration-based MCP image ingestion

Status: code-complete but dark. This contract does not become live until the dedicated app role,
client identity, database delta and default-off settings below are applied and independently tested.

This is the one deliberately narrow autonomous write lane. It lets a folder-watcher find one current
case by a UK registration and submit JPG, PNG or WebP images through the same evidence upload,
classification, Archive-outbox and readiness path used by staff. It does not expose a general case
writer, Outlook capability, case-id selector or Archive-folder selector.

## Tools

### `lookup_open_case_by_registration`

Input:

```json
{ "registration": "SP23 OBX" }
```

The server uses the shared registration canonicaliser and performs an exact canonical match. An exact
eligible result returns only the canonical registration, Case/PO and current status/queue. It does not
return claimant, contact, email, case row id or Archive folder id.

Structured refusals are non-mutating:

| Code | Meaning |
| --- | --- |
| `invalid_registration` | The value is not a supported UK registration shape. |
| `no_match` | No case has the exact canonical registration. |
| `ambiguous_match` | More than one current case matches; the server will not choose. |
| `ineligible_case` | Matching rows are terminal, removed or merge-retired. |
| `archive_target_unavailable` | The one current case has no server-owned Archive target. |

### `upload_case_images`

Input:

```json
{
  "registration": "SP23 OBX",
  "idempotencyKey": "drop-agent:SP23OBX:batch-0001",
  "files": [
    {
      "fileName": "IMG_0001.jpg",
      "contentType": "image/jpeg",
      "dataBase64": "<standard base64>"
    }
  ]
}
```

The write tool resolves the registration again at call time. There is intentionally no `caseId`,
`folderId` or path field. Supplied filenames are reduced to a basename and control characters are
removed. The server applies the same content-signature and full image-decode checks as Add evidence:
JPG, PNG and WebP only; at most 20 files; 15 MB per file; 30 MB decoded per MCP batch (the canonical
staff seam remains 100 MB, but Base64 plus image decoding expands the Function's memory use). A MIME/extension mismatch,
invalid base64, corrupt image, unsafe type or exceeded limit is refused before that file is persisted.

The idempotency key is bound to the authenticated client, resolved case, canonical registration and
ordered content manifest. Repeating the exact key and bytes is safe; reusing it for another case or
manifest is refused. The `staff_evidence_upload` owner record stores the client, registration, case,
key, retry count and per-file hashes/states. A created evidence row also writes the controlled
`agent_write` audit action; image bytes are never written to a log or database column.

Responses are intentionally conservative:

- `complete` means every accepted image has durable evidence readback, its image check is complete,
  Archive work is complete or not required, and readiness recomputation is current.
- `accepted_pending_processing` means evidence is durable but classification, Archive work or
  readiness is still pending. This is not reported as success (`ok` is false).
- `accepted_requires_review` means evidence is durable but an image check ended in an explicit
  staff-review disposition. It is not reported as success.
- `partial`, `rejected` and `incomplete_readback` identify retryable per-file outcomes without claiming
  that an incomplete write finished.

Each accepted file returns its evidence id, SHA-256, duplicate flag/outcome, classification state and
Archive state. The response includes the case's current readiness status without exposing personal
details.

## Authorization and dark gates

Create one dedicated confidential client (or federated workload identity) and assign it only the
API app role `CollisionSpike.ImageIngest`. The access token must be app-only, have the CollisionSpike
API as its audience, and contain no delegated user scope. Do not grant the client Microsoft Graph,
Outlook, general `CollisionSpike.User`, `CollisionSpike.Superuser` or the broader deferred
`CollisionSpike.Agent` role.

The existing interactive MCP client stays delegated/read-only and never sees `upload_case_images`.
The image client sees exactly the two tools on this page; it cannot call the other assistant reads or
any other write route.

All of these settings are required on the Data API. Missing or mismatched settings keep the write lane
dark:

```text
MCP_SERVER_ENABLED=true
MCP_IMAGE_INGEST_ENABLED=true
MCP_IMAGE_INGEST_BOX_ROOT_ID=392761581105
BOX_API_ENABLED=true
BOX_FOLDER_ROOT_ID=392761581105
```

The two independent root settings must both equal programme test root `392761581105`. Archive work
uses only the case's server-owned folder and the existing root-scoped Box facade; the MCP request
cannot redirect it. Before live proof, also read back the Box Function's independent
`BOX_ALLOWED_ROOT_ID=392761581105` scope lock; that facade checks the target folder's Box ancestry
before upload. Do not enable this lane for a different root during this programme.

Apply `migration/assets/schema/deltas/2026-07-12-tkt154-mcp-image-ingestion.sql` before deploying the
API. The sample one-pass folder scanner is [`tools/mcp-image-folder-watcher.mjs`](../../tools/mcp-image-folder-watcher.mjs).
It reads its endpoint, bearer and folder from environment variables and contains no secret.

## Live proof checklist

1. Authenticate as the dedicated app-only role and call `tools/list`; exactly the two tools above must
   appear. Repeat as the delegated MCP client; the upload tool must be absent and refused if named.
2. Prove spaced/canonical lookup plus invalid, no-match, ambiguous and terminal/merged refusals.
3. On a designated case whose Archive folder is below test root `392761581105`, upload a harmless image,
   repeat the exact key, and prove one evidence row/Blob/Archive file.
4. Read back the image check, registration-visible result, status-recompute generation, audit/owner
   record and case attachment. A pending dependency must remain pending in the tool result.
5. Prove an unsafe type and a mixed batch, and confirm no Outlook change and no Box write outside the
   test root.
