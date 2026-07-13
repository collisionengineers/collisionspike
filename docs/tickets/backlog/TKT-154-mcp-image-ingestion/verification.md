# Verification — TKT-154: Add a constrained MCP path for registration-based image ingestion

## Verdict
PENDING

## Evidence

Offline implementation evidence on the ticket branch:

- Implementation commits under test: `47895b0`, second-audit hardening `e2a25eb`, and third-audit
  hardening `3cd783c`.

- API full suite: **68 files / 667 tests passed**, including the published
  `@modelcontextprotocol/sdk` Streamable HTTP client compatibility test against the registered route
  (initialize/initialized, tools/list and structured tool error). MCP protocol/principal/image-ingest/
  evidence/auth/Box-client/internal-archive coverage, registration TOCTOU refusal, multi-role denial, cumulative preflight,
  sanitized write/readback failures, no public evidence UUID, full initialize lifecycle, Origin/
  Accept/version/body/batch enforcement and Box-scope attestation.
- API TypeScript build passes.
- Orchestration full suite: **30 files / 421 tests passed**, including Archive transport/root
  propagation and the adversarial visible-text image-classification fixture. Orchestration TypeScript
  build passes.
- Box façade full suite: **251 tests passed**, including unset/wrong/out-of-root refusal and strict
  recheck before upload.
- Root suite passes: domain **54 files / 1,132 tests**, SPA **39 files / 453 tests**, reciprocal PR
  review hooks **48 tests**, and the session-requiring folder watcher **1 test**.
- Ticket validator: **164 tickets, 0 failures, 0 warnings**. Documentation links/orphans/live-fact
  leakage check passes (26 known historical absent-link backlog entries remain informational).
- `git diff --check` passes.

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

## Pending / gaps

- Apply `2026-07-12-tkt165-staff-evidence-upload.sql`, then
  `2026-07-12-tkt154-mcp-image-ingestion.sql` to live Postgres and prove table/RLS/grants as `cespk_app`.
- Deploy the Box façade, Data API and orchestration builds from the reviewed/merged commit.
- Create/read back the API role and one client assignment carrying exactly
  `CollisionSpike.ImageIngest`, with no delegated scope, staff/general-Agent role or Graph permission.
- Read back the API gates/Box façade host+key/root settings and the Box Function's
  `BOX_ALLOWED_ROOT_ID=392761581105`; prove unset/wrong/out-of-root failures.
- Read back orchestration `IMAGE_ROLE_CLASSIFY_ENABLED=true`, `BOX_API_ENABLED=true` and
  `BOX_FOLDER_AT_INTAKE_ENABLED=true`.
- Use a standard MCP client for initialize→initialized→tools/list→lookup→upload, then read back the
  one evidence row, Blob, Box file, image classification, audit/owner row, readiness generations and
  case attachment. Repeat the idempotency key and prove no duplicate.
- Confirm no Outlook mutation and no Box write outside the designated test root.
- Run the adversarial-text PNG through the live classifier on the designated test case and prove the
  visible instruction does not alter the classification contract. Offline mock behavior is not live proof.

## How to re-verify
Follow `docs/architecture/mcp-image-ingestion.md` in deploy order. Preserve role/app-setting readbacks,
standard-client HTTP evidence, SQL readback, Box ancestry/file evidence, classifier/readiness state and
the duplicate-retry proof. Only then can an independent verifier move this ticket from verify to done.
