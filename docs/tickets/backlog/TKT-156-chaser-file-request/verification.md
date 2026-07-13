# Verification — TKT-156: Put an active archive upload link in every image chaser

## Verdict
PENDING — implementation and rollout verified; end-to-end File Request proof blocked on one-time signed-in template creation

## Evidence
- Implementation commit: `7a2d2eeb1543b25f093e5db29700764549cb030f`; repair follow-up: `cc3562ff37bac5c0e557eb690abbffd4b9417ecc`.
- API full suite: `66` files / `653` tests passed; `npm run build` passed.
- SPA full suite: `41` files / `468` tests passed; production Vite build passed (existing large-chunk warning only).
- Box Function full suite: `250` tests passed.
- Repository-wide `node verify-all.mjs`: `8` passed / `0` failed / `13` documented skips; includes SPA, API, domain and orchestration builds/tests. The aggregate gate skipped Python because no local `.venv`, so the separately run `250`-test Box Function result above is the Python proof for this ticket.
- Ticket, documentation-link and shared-skill checks passed.
- Exact-head reciprocal PR review: Claude `PASS` and Codex `PASS` on `3edffdb901916b36f8c9b5eacf0ba13bb76e63d0`; PR 77 merged as `ed3eccdc0f4946ce02bfc35dd60952a513880b56`.
- Live Postgres delta apply completed under the Entra admin with a trap-cleaned transient firewall rule. Readback returned both chaser columns, `box_file_request_outbox.repair_reason=1`, and `ix_chaser_case_file_request_open=1`; the post-run firewall list contained only `AllowAzureServices`.
- Live Box Function publish completed at `2026-07-13T04:43:25Z`. Function enumeration returned `12`, root `392761581105` listed successfully through the deployed service identity (`total_count=379`), and the File Request lifecycle route was registered.
- Serialized live API/SPA deployment came from later `main` `6ebfb7ea25b43dfbb3655883d67eda7fa30859c0`, which contains PR 77. API Kudu package `cdc10863-adcf-423b-978d-6eaa75b4cc76` completed at `2026-07-13T04:47:16Z`; independent readback returned `111` functions and an unauthenticated File Request-template gate probe returned `401`.
- Live SPA probe returned HTTP `200`, `/assets/index-BGDf47o7.js` returned `200`, and the response includes the strict `content-security-policy` allowing only the intended API and Microsoft sign-in origins.
- Live safe-setting readback: API `BOX_FILEREQUEST_ENABLED=true`, API `BOX_FOLDER_ROOT_ID=392761581105`, Box Function `BOX_ALLOWED_ROOT_ID=392761581105`; API `BOX_FILE_REQUEST_TEMPLATE_ID` is absent.
- Focused contracts:
  - `api/src/lib/box-file-request-outbox.test.ts` — first create, concurrent ownership, active reuse, transient retry, inactive/expired reactivation, deleted/invalid/terminal-repair replacement and folder-not-ready.
  - `api/src/functions/cases-chase.test.ts` — image/picture chasers require the link, persist its identity and refuse a link from a superseded folder; non-image chasers remain unaffected.
  - `mockup-app/src/components/ChaserPanel-copy.test.tsx` — the editable message and active HTTPS link copy together; a failed link copies/logs nothing.
  - `functions/box-webhook/tests/test_scope_lock.py` and `test_file_request_routes.py` — template/request folder containment, expected-folder lifecycle calls, restricted reactivation fields and a fresh ancestry read despite a stale warm-worker cache.
  - `api/src/functions/internal-evidence-dedup.test.ts` — only a newly inserted Box image satisfies image chasers; a cross-lane archive mirror and redelivery do not.

## Pending / gaps
- The approved template still needs to be created in the signed-in Box web interface inside test root `392761581105`, and its non-secret ID must be supplied as `BOX_FILE_REQUEST_TEMPLATE_ID` on the API. The Box connector/CLI is not authenticated in this worker, the browser is at Box sign-in, and neither the connected Box tools nor Box REST provides initial File Request creation.
- The live database has `0` existing case File Request identities, so there is no safe in-root template to reuse. No attempt was made to use an object outside the permitted root.
- Acceptance still requires the signed-in, designated-test-case proof: exact message/link, concurrent reuse, inactive/expired repair, deleted replacement, one upload through the link, resulting Box file/evidence/classification/readiness/chaser state, audit rows, redelivery idempotency and confirmation of zero writes outside the test root.
- The existing File Request webhook firing is an empirical integration contract, so offline tests cannot certify the real upload event.

## How to re-verify
1. Sign in to Box in Chrome, open root `392761581105`, create/approve one File Request template there, set its non-secret ID as `BOX_FILE_REQUEST_TEMPLATE_ID` on `cespk-api-dev`, and read the setting back without exposing credentials.
2. On a test case whose authoritative archive folder is under `392761581105`, copy an image chaser. Confirm the visible and clipboard messages contain exactly one active `https://app.box.com/f/...` link.
3. Repeat and concurrently retry. Confirm the same request ID/link is reused. Exercise one inactive/expired request and one deleted request; confirm reactivation or one audited replacement generation.
4. Upload a unique test image through the request. Confirm `FILE.UPLOADED` writes one evidence row to the correct case, classification runs, readiness is recomputed, and the linked image chaser becomes responded. Redeliver the event and confirm no duplicate evidence/audit/response transition.
5. Read back the Box folder tree and audit records to prove all writes stayed beneath `392761581105`; inspect post-deploy telemetry for failures.
