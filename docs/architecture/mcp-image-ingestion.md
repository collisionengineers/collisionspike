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

The write tool resolves the registration again at call time and repeats the exact-match/eligibility
test under a registration-scoped advisory lock plus a short `case_` SHARE lock before any Blob write.
The table lock prevents a concurrent case insert or VRM update from creating a phantom second match
before the idempotency binding commits. There is intentionally no `caseId`,
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
- `partial`, `rejected`, `write_state_unconfirmed` and `incomplete_readback` identify retryable per-file outcomes without claiming
  that an incomplete write finished.

Each accepted file returns its original batch index, normalised filename, SHA-256, outcome,
classification state and Archive state. Database evidence ids, backend exception text and Archive
retry error text are deliberately not returned. When a canonical write throws or returns an unknown
shape, the response says `retry_required` and instructs the caller to reuse the same idempotency key.
When only the post-write state readback fails, the durable receipt is retained without exposing the
internal id. The response includes the case's current readiness status without exposing personal details.

## MCP transport contract

The endpoint uses MCP 2025-06-18 Streamable HTTP with a durable lifecycle session. A client must:

1. `POST` `initialize`, then send `notifications/initialized`;
2. include `Accept: application/json, text/event-stream` and `Content-Type: application/json`;
3. retain the server-minted `Mcp-Session-Id` and send it with the negotiated
   `MCP-Protocol-Version` after initialization; and
4. send one JSON-RPC message per request. JSON-RPC arrays/batches are refused, so uploads cannot run
   concurrently through one HTTP request.

The published MCP SDK schemas validate request/notification envelopes, initialize fields, integer/string
request ids, tools params and initialized/cancelled notification shapes at runtime. Response envelopes
are never accepted as requests. `initialize` must be the first interaction; a Postgres-backed session
records `initializing → ready`, so scale-out cannot bypass the initialized notification. Tool/business
refusals are MCP tool results with `isError: true` and `structuredContent`; malformed JSON-RPC remains a
protocol error. Browser-origin requests are rejected unless their exact Origin is listed in
`MCP_ALLOWED_ORIGINS` (folder watchers normally send no Origin). The dedicated identity is durably
limited per minute in Postgres.

The autonomous body is consumed through a byte-counted `ReadableStream` before JSON/Base64
materialization. `Content-Length` is only an early rejection hint: chunked/HTTP2 requests with no length
are bounded by the stream counter, and a runtime that supplies neither a stream nor a platform-bounded
body is refused. Cumulative decoded-size checks then run before image buffers are retained. The sample
watcher implements the full lifecycle, confirms both required tools via `tools/list`, and sends batches
sequentially so earlier Base64 batches are released before the next is assembled.

## Authorization and dark gates

Create one dedicated confidential client (or federated workload identity) and assign it only the
API app role `CollisionSpike.ImageIngest` and no other app role. The access token must be app-only, have the CollisionSpike
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
BOX_FN_URL=<box facade host>
BOX_FN_KEY=<Key Vault referenced function key>
MCP_IMAGE_INGEST_REQUESTS_PER_MINUTE=60
```

The two independent root settings must both equal programme test root `392761581105`. Before live
proof, deploy the Box façade change and read back the Box Function's independent
`BOX_ALLOWED_ROOT_ID=392761581105` scope lock. The API asks that façade to attest the configured root
and target-folder ancestry on every lookup/write resolution. Agent-sourced evidence also sends
`requiredWriteRootId=392761581105` when the asynchronous Archive worker performs the actual upload;
the façade performs a fresh, uncached `path_collection` read immediately before bytes leave it. The
strict path never trusts a prior ancestry cache, so a case folder moved after lookup is refused. An
unset lock, wrong lock, moved folder or other out-of-root folder therefore fails closed at both points.
Do not enable this lane for a different root during this programme.

The existing downstream path must also be live on orchestration before the MCP gate is enabled:

```text
IMAGE_ROLE_CLASSIFY_ENABLED=true
BOX_API_ENABLED=true
BOX_FOLDER_AT_INTAKE_ENABLED=true
```

Read all three settings back from `cespk-orch-dev`; otherwise durable evidence can remain pending and
the MCP tool must never claim completion. The image-classifier prompt treats all visible image text,
QR codes, captions and metadata as untrusted evidence and never follows instructions embedded in a
photo. Offline coverage sends a real accepted PNG bearing adversarial visible text through the mocked
classifier HTTP seam; behavioral proof against the live model remains pending and must not be inferred
from that deterministic test.

Apply `migration/assets/schema/deltas/2026-07-12-tkt154-mcp-image-ingestion.sql` before deploying the
API. Deploy the Box façade, API and orchestration changes before enabling the gate. The sample one-pass folder scanner is [`tools/mcp-image-folder-watcher.mjs`](../../tools/mcp-image-folder-watcher.mjs).
It reads its endpoint, bearer and folder from environment variables and contains no secret.

## Live proof checklist

1. Authenticate as the dedicated app-only role and call `tools/list`; exactly the two tools above must
   appear. Repeat as the delegated MCP client; the upload tool must be absent and refused if named.
2. Prove spaced/canonical lookup plus invalid, no-match, ambiguous and terminal/merged refusals.
3. Read back the Box façade lock and all three downstream orchestration gates. On a designated case whose Archive folder is below test root `392761581105`, upload a harmless image,
   repeat the exact key, and prove one evidence row/Blob/Archive file.
4. Read back the image check, registration-visible result, status-recompute generation, audit/owner
   record and case attachment. A pending dependency must remain pending in the tool result.
5. Prove an unsafe type, a mixed batch, an image containing adversarial instruction text, and
   unset/wrong/out-of-root scope refusals. Confirm no Outlook change and no Box write outside the test root.
6. Run the lifecycle with a standard MCP client as well as the sample watcher: initialize, initialized
   notification, tools/list, lookup and upload. Preserve the exact HTTP/protocol evidence.
