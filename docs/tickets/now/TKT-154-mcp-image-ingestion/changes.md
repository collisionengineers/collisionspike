# Changes — TKT-154: Add a constrained MCP path for registration-based image ingestion

## Status
Code-complete on the ticket branch; deliberately dark and not deployed.

Implementation commit: `47895b0` (`Harden constrained MCP image ingestion`).
Second-audit hardening commit: `e2a25eb` (`Close TKT-154 second audit gaps`).
Third-audit hardening commit: `3cd783c` (`Close TKT-154 third audit gaps`).

## Changes made

- Added a dedicated app-only MCP principal split. The write identity must carry exactly
  `CollisionSpike.ImageIngest`; delegated, missing-role and multi-role tokens fail closed.
- Added MCP 2025-06-18 initialization/version negotiation, Streamable HTTP media checks, Origin
  validation, protocol-version responses, JSON-RPC envelope validation, notification handling,
  structured tool errors and refusal of JSON-RPC arrays/concurrent batch writes.
- Added registration-only lookup/upload tools. The client cannot supply a case or Archive folder id.
  The canonical registration is rechecked under a transaction-scoped registration lock before any
  Blob write, eliminating lookup-to-bind ambiguity/reassignment races.
- Reused the TKT-165 evidence upload seam with stable idempotency, content hashes, per-file outcomes,
  agent audit records, image-classifier handoff and readiness recomputation.
- Added pre-parse HTTP body admission, cumulative Base64 decoded-size preflight, strict image bounds,
  and a durable Postgres per-client request counter (`196_mcp_image_ingest_rate_limit.sql` plus the
  live delta/RLS/grant changes).
- Added a strict Box write-scope attestation route. Unset, mismatched and out-of-root scope locks fail
  closed. Agent evidence repeats `requiredWriteRootId=392761581105` at the asynchronous Archive upload,
  immediately before bytes leave the Box façade.
- Sanitized public results: no evidence UUIDs, backend exceptions or Archive retry errors. Unknown
  write outcomes preserve retry-safe per-file receipts; readback failure retains a durable receipt.
- Hardened the image-classifier instruction against text/QR/metadata prompt injection and added an
  adversarial visible-text image fixture.
- Updated the sample folder watcher to perform the full MCP lifecycle, send the required headers and
  release each sequential batch before assembling the next.
- Updated the architecture and gated runbooks with the Box lock, downstream orchestration gates,
  schema/deploy order and standard-client proof requirements.

## Second audit hardening

- Replaced the strict Box path's cached ancestry reuse with a fresh `path_collection` read on every
  autonomous attestation, immediately before upload. Regression coverage verifies that a folder first
  accepted under the test root and then moved outside it is refused without a second byte upload.
- Replaced `Content-Length`-dependent admission with a byte-counted Web `ReadableStream`. Missing length
  on chunked/HTTP2 requests cannot bypass the cap; a runtime with no bounded stream is refused.
- Added official MCP SDK runtime schemas plus a durable `mcp_http_session` table. Initialize mandatory
  fields, request ids, request/notification/response distinction, initialized notification shape,
  negotiated protocol and first-interaction ordering are now enforced across Function scale-out.
- Replaced the SVG prompt-injection fixture with a real accepted PNG and carried it through the mocked
  classifier HTTP seam. Live-model behavior remains explicitly pending.
- Made the sample watcher call and verify `tools/list` before its first `tools/call`.

## Third audit hardening

- Made the sample watcher capture the server-issued `Mcp-Session-Id` from `initialize` and send it on
  `notifications/initialized`, `tools/list`, lookup and upload. A wire-level behavioral test runs the
  watcher against a server that returns 404 when the session or protocol header is missing.
- Aligned session failure responses with MCP 2025-06-18: missing/malformed headers remain HTTP 400;
  valid-format session IDs that are absent, expired, not ready, or do not match the authenticated
  principal/protocol return HTTP 404.
- Bounded durable lifecycle state per authenticated principal. Creation takes a principal-scoped
  transaction advisory lock, reuses only that principal's expired rows, defaults to a hard eight-row
  cap, and returns retryable HTTP 429 at capacity. The schema now indexes principal plus expiry.

## Pull-request review hardening

- Kept `error`-status evidence recovery available to staff while refusing the autonomous image lane
  on that state. Removed the registration path's table-wide lock; its advisory lock and matched-row
  locks no longer stall unrelated case writes.
- Proved the numbered canonical MCP table files run before the shared forced-RLS policy pass in
  `900_constraints.sql`; the live delta retains equivalent explicit policies.
- Added the standard initialize/initialized session lifecycle to delegated read-only route coverage
  and made migration-before-API ordering an explicit protection for the already-live read lane.

## Deliberately not done here

- No Entra role/client/service-principal creation or assignment.
- No live DDL, app-setting change, deployment, Box write or Outlook mutation.
- No real authenticated standard-client/Box/classification/readiness proof. Those remain the live
  verification gate and are recorded in `verification.md`.
- No live-model prompt-injection proof; only the deterministic raster/seam regression was run offline.
