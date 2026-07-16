# Changes — TKT-142: Box facade 502s on large base64 payloads — QDOS26029 archive stranded (17.6 MB .eml)

## Status
DEPLOYED + retry PROVEN LIVE (final wave D2, 2026-07-09): the stranded QDOS26029 archive
completed **4/4** through the new streamed blob lane. Verification transcription PENDING.

## Root cause
The facade upload route took base64-in-JSON only, with NO size cap: a 17.6 MB raw `.eml`
(~23 MB encoded) reached `b64decode` and killed the Python worker (502), with small files
failing as recycle collateral (TKT-087 verification). Note: 17.6 MB is BELOW Box's 20 MiB
chunked-upload minimum — the fix needed a streaming direct lane, not just the chunked API.

## box-webhook Function (services/functions/box-webhook/) — large-payload lanes

- `function_app.py` upload route (`POST box/folders/{folderId}/files`) now takes TWO mutually
  exclusive body variants (400 if both/neither):
  - `{ filename, contentBase64, contentType? }` — earlier lane kept, response unchanged, but
    length-capped BEFORE decode (default 11 MiB base64 ≈ 8 MiB raw; `BOX_UPLOAD_BASE64_MAX_CHARS`
    overrides) → 413 naming the blobPath alternative. A giant base64 body can no longer reach
    b64decode and kill the worker.
  - `{ filename, blobPath, contentType? }` — NEW: the facade downloads the blob itself from
    `https://{EVIDENCE_BLOB_ACCOUNT}.blob.core.windows.net/{EVIDENCE_BLOB_CONTAINER}/{blobPath}`
    (managed-identity bearer via the Functions MSI endpoint, plain httpx, cached mint with an
    expires_on refresh margin — `blob_source.py`, new), streaming into a SpooledTemporaryFile and
    computing sha1 + sha256 + size in flight. Strict SSRF/path-traversal guard on blobPath.
    Response adds `bytes`, `sha256`, `lane` to today's entry fields.
- `box_client.py`: new `upload_file_stream` — size-branched at `CHUNKED_UPLOAD_MIN_BYTES`
  (20 MiB): direct multipart streaming below it; Box chunked-upload session at/above it
  (create → EXACT part_size parts with per-part `digest: sha=<b64 sha1>` + `content-range`,
  parts retried once on 5xx → commit with parts list, {name,parent} attributes and the
  whole-file digest; bounded 202 retries; session endpoints host-pinned to *.box.com). The
  TKT-087 sha1 409-idempotency factored into a shared `_resolve_upload_conflict` used by all
  lanes.
- Tests: `services/functions/box-webhook/tests/test_blob_source.py` (25),
  `services/functions/box-webhook/tests/test_upload_stream.py` (11), upload-route
  additions (lane contract, 413-before-decode, traversal rejection, blob lane happy/404/502).
  box-webhook pytest 150 → 238, green.

## Orchestration — large evidence goes by blobPath

- `services/orchestration/src/adapters/functions-client.ts` — new `box.uploadFileFromBlob(folderId, filename,
  blobPath, contentType?)` on the same facade route; `blobPath` = the evidence row's
  container-relative `storage_path` (the exact `blob.ts` convention).
- `services/orchestration/src/platform/blob.ts` — new `getEvidenceBlobSize(blobPath)` (getProperties HEAD;
  a large file is never downloaded into the orch just to measure it).
- `services/orchestration/src/workflows/archive/boxArchive.ts` — `uploadArchiveItem()` (exported,
  injectable): size > `boxInlineUploadMaxBytes()` (env `BOX_INLINE_UPLOAD_MAX_BYTES`, default
  8 MiB) → blob-reference upload (zero bytes through the orch); at/below → today's inline
  base64 byte-for-byte. Per-file isolation preserved (the existing per-item try/catch; the
  >cap path additionally keeps oversized bodies off the facade JSON route entirely — the
  collateral's root cause). The deliberate stamp-failure throw is unchanged.
- New `boxArchive.test.ts` (7 cases). Orch suite 262/262 green; `tsc -b` clean.

## Identity/auth wiring (done live, 2026-07-09)
- **RBAC granted:** the box-webhook Function's system-assigned MI
  (`5db514c8-25f2-4d94-81ec-3878286d0087`) now holds **Storage Blob Data Reader**
  (`2a2b9908-6ea1-4ae2-8e65-a410df84e7d1`) on `cespkevidstdev01` — role assignment
  `25c7bca6-c4eb-460f-a690-cc2e8d377e61`, applied via ARM PUT (the `az role assignment`
  MissingSubscription workaround per identity-rbac.md). Granted ahead of deploy for
  propagation.
- **App settings to set at deploy:** `EVIDENCE_BLOB_ACCOUNT=cespkevidstdev01` (+ optional
  `EVIDENCE_BLOB_CONTAINER`, default `evidence` — matches orch `blob.ts`). `IDENTITY_ENDPOINT`/
  `IDENTITY_HEADER` are platform-injected.

## Gate governance
Rides the existing `BOX_API_ENABLED` (live `true`) — no new gate; `BOX_INLINE_UPLOAD_MAX_BYTES`
and `BOX_UPLOAD_BASE64_MAX_CHARS` are tuning knobs with safe defaults, not gates.

## Live retry — EXECUTED 2026-07-09 (the acceptance line)
1. `EVIDENCE_BLOB_ACCOUNT=cespkevidstdev01` + `EVIDENCE_BLOB_CONTAINER=evidence` set + readback
   on `cespkbox-fn-v76a47`; box-webhook deployed (still 12 functions; authenticated read smoke
   200 on the allowed root).
2. Orch deployed (72 functions); then the sanctioned retry:
   keyed `POST /api/box-archive {"caseId":"ae1c0c84-ba0c-4049-be73-c149b46c2ffa"}` →
   durable instance `437c002e1aad439395e8fc2f518e4d6c` → **runtimeStatus `Completed`, output
   `{"uploaded": 4, "total": 4}`** — the stranded QDOS26029 archive is complete, 17.6 MB `.eml`
   included, zero small-file collateral (4/4, was 0/4). Box writes stayed within the CASE
   folder under the archive root (the sanctioned scope).

## Remainders
- The ≥20 MiB chunked-session lane is offline-mocked only (no live file that size yet); the
  202-on-commit retry path implemented but not live-exercised.
- If Box omits `context_info.conflicts` on a session-create/commit 409 entirely, the upload
  fails honestly with a 409 BoxError (never a blind reuse).
