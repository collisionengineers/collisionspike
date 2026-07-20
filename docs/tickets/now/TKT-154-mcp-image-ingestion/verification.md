# Verification — TKT-154: Add a constrained MCP path for registration-based image ingestion

## Verdict
PENDING

## Evidence

### 2026-07-16 deployment update

- `mcp_http_session` and `mcp_image_ingest_rate_limit` were present live with forced RLS and policies.
- The Box façade, Data API and orchestration were deployed and registered their reviewed routes/functions.
- `MCP_IMAGE_INGEST_ENABLED` and `MCP_IMAGE_INGEST_BOX_ROOT_ID` remained absent, so the lane stayed dark.
  The Box façade remained locked to test root `392761581105`.
- No dedicated `CollisionSpike.ImageIngest` principal was created or assigned, no standard-client upload was
  run, and no Box or Outlook mutation was used as proof. The verdict therefore remains PENDING.

Offline implementation evidence on the ticket branch (PR #73, `codex/tkt-154-mcp-image-ingestion`).
The branch was rebased onto post-#99 `main` (base `ae3bdb48`) on 2026-07-15, its five rebase conflicts
resolved, and the four review lanes below remediated; the counts in this file are from a full offline
gate re-run on that rebased-and-remediated head. Head/base bind to the actual PR #73 branch tip and
base `ae3bdb48` directly (the retired reciprocal-AI PR-review workflow — removed on `main` by TKT-149 —
is no longer the review authority and is not referenced as live).

- API full suite: **82 files / 835 tests passed**, including the published
  `@modelcontextprotocol/sdk` Streamable HTTP client compatibility test against the registered route
  (initialize/initialized, tools/list and structured tool error). MCP protocol/principal/image-ingest/
  evidence/auth/Box-client/internal-archive coverage, registration TOCTOU refusal, multi-role denial, cumulative preflight,
  sanitized write/readback failures, no public evidence UUID, full initialize lifecycle, Origin/
  Accept/version/body/batch enforcement and Box-scope attestation.
- API TypeScript build passes.
- Orchestration full suite: **40 files / 476 tests passed**, including Archive transport/root
  propagation, the adversarial visible-text image-classification fixture, and the new plate-OCR
  preservation regression (Lane B). Orchestration TypeScript build passes.
- Box façade (Python `box-webhook`) suite: **not re-run in this offline convergence** (requires the
  pytest venv, unavailable on this build box). Unchanged by the rebase/remediation, which touched no
  Python files; the box-webhook scope-lock/upload tests added by this PR were green at authoring.
- Root suite passes: domain **62 files / 1,196 tests**, SPA **51 files / 525 tests**, and the
  session-requiring folder watcher **1 test**. (There is no reciprocal-PR-review test suite — TKT-149
  removed it from the tree; it is not counted here.)
- Ticket validator: **199 tickets, 0 failures, 0 warnings**. Documentation links/orphans/live-fact
  leakage check passes (24 known historical absent-link backlog entries remain informational).
- `git diff --check` passes.
- Production dependency audit has no high/critical finding. It reports the repository's two inherited
  moderate `durable-functions`/`uuid` findings; this branch does not change either dependency.

Second-audit evidence included in the full-suite totals above:

- Published MCP SDK schemas validate every accepted request/notification; the SDK transport test now
  proves the server-minted session id is returned and reused for initialized/list/call requests.
- A no-`Content-Length` oversized stream is refused by counted bytes, and a missing bounded stream is
  refused rather than falling back to unbounded `json()` materialization.
- Box tests cover both the no-cache “verified then moved” ancestry sequence and the actual autonomous
  upload route refusing the second upload.
- The adversarial fixture decodes through Sharp as a 420×50, 344-byte `image/png`; the mocked classifier seam receives its data URL and
  returns a parsed classification without the visible instruction becoming prompt text.

Third-audit evidence included in the full-suite totals above:

- The folder-watcher behavioral test uses a local session-requiring HTTP server and proves the exact
  server-issued session id plus MCP version reach initialized, list, lookup and upload requests.
- Route tests distinguish missing/malformed session headers (400) from valid-format unresolved,
  expired, wrong-principal, wrong-version or failed-initialization session state (404).
- Session-store tests prove principal-scoped advisory locking, expired-own-row reuse, the repeated
  principal/expiry predicate, a configurable hard cap, and retryable 429 route behavior at capacity.

Review-hardening evidence included in the full-suite totals above:

- Staff uploads remain accepted on an `error` case while the autonomous principal receives a 409;
  removed and other closed case states remain refused for both.
- The registration-binding test proves the shared advisory lock is present, the whole-table SHARE lock
  is absent, and the predicate deliberately takes no Case tuple lock. Canonical and live-delta schema
  tests prove all eligibility-changing Case mutations take the same registration key.
- The canonical-schema test proves both numbered MCP table files are covered by the shared forced-RLS
  policy loop, the live delta applies explicit forced policies/grants, and route tests pin the
  fail-closed assertion before either MCP identity reaches protected state. Its query reads
  `current_setting('app.role')` from Postgres; the live value remains part of the pending proof below.
- Autonomous lookup now treats an `error` case as ineligible on the same terms as upload, and the
  protocol suite proves both initialized and cancelled notifications return no JSON-RPC response.
- Session tests prove delegated users are keyed by user identity, image agents by application identity,
  and neither lane falls back into the other's namespace. Missing lane-specific identifiers fail closed.
- Filename and watcher tests prove bidi/zero-width/control sanitisation and that non-file directory
  entries are not read as images.

## Pending / gaps

- Create/read back the API role and one client assignment carrying exactly
  `CollisionSpike.ImageIngest`, with no delegated scope, staff/general-Agent role or Graph permission.
- Prove the API gate/Box host+key/root configuration and unset/wrong/out-of-root failures with the dedicated
  principal; current readback proves only that the gate is dark and the Box Function is test-root locked.
- Read back orchestration `IMAGE_ROLE_CLASSIFY_ENABLED=true`, `BOX_API_ENABLED=true` and
  `BOX_FOLDER_AT_INTAKE_ENABLED=true`.
- Use a standard MCP client for initialize→initialized→tools/list→lookup→upload, then read back the
  one evidence row, Blob, Box file, image classification, audit/owner row, readiness generations and
  case attachment. Repeat the idempotency key and prove no duplicate.
- Confirm no Outlook mutation and no Box write outside the designated test root.
- Run the adversarial-text PNG through the live classifier on the designated test case and prove the
  visible instruction does not alter the classification contract. Offline mock behavior is not live proof.
- Prove on a real clean-plate photo that the Lane-B hardened classifier prompt still yields
  `registration_visible: true` and the correct `plate_text` (the offline prompt-content + seam
  regression locks the wording, but live-model plate OCR under the hardened prompt is not yet proven).

## How to re-verify
Follow `docs/architecture/mcp-image-ingestion.md` in deploy order. Preserve role/app-setting readbacks,
standard-client HTTP evidence, SQL readback, Box ancestry/file evidence, classifier/readiness state and
the duplicate-retry proof. Only then can an independent verifier move this ticket from verify to done.

## 2026-07-20 addendum

`MCP_IMAGE_INGEST_ENABLED=true` and `MCP_IMAGE_INGEST_BOX_ROOT_ID=392761581105` were flipped live on
`cespk-api-dev` by explicit operator direction during the TKT-159 gate audit (see `changes.md`). Confirmed
this still fails closed for every real caller — no principal holds the required `CollisionSpike.ImageIngest`
Entra app role. The first "Pending / gaps" item (create/read back that role) is unchanged and still
outstanding; verdict stays `PENDING`.
