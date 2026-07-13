# Verification — TKT-154: Add a constrained MCP path for registration-based image ingestion

## Verdict
PENDING

## Evidence

Offline implementation evidence on the ticket branch. The implementation plus fresh-review hardening
commit under test is `946946d`, rebased on `f419e31`. Canonical reciprocal PR comments bind the exact
final PR head/base after this evidence file is committed; that non-self-referential marker is the
authority for review freshness.

- API full suite: **79 files / 778 tests passed**, including the published
  `@modelcontextprotocol/sdk` Streamable HTTP client compatibility test against the registered route
  (initialize/initialized, tools/list and structured tool error). MCP protocol/principal/image-ingest/
  evidence/auth/Box-client/internal-archive coverage, registration TOCTOU refusal, multi-role denial, cumulative preflight,
  sanitized write/readback failures, no public evidence UUID, full initialize lifecycle, Origin/
  Accept/version/body/batch enforcement and Box-scope attestation.
- API TypeScript build passes.
- Orchestration full suite: **34 files / 445 tests passed**, including Archive transport/root
  propagation and the adversarial visible-text image-classification fixture. Orchestration TypeScript
  build passes.
- Box façade full suite: **257 tests passed**, including unset/wrong/out-of-root refusal and strict
  recheck before upload.
- Root suite passes: domain **59 files / 1,177 tests**, SPA **50 files / 522 tests**, reciprocal PR
  review hooks **48 tests**, and the session-requiring folder watcher **1 test**.
- Ticket validator: **167 tickets, 0 failures, 0 warnings**. Documentation links/orphans/live-fact
  leakage check passes (26 known historical absent-link backlog entries remain informational).
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

Pull-request review evidence included in the full-suite totals above:

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
