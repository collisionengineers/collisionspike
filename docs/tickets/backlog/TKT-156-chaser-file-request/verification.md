# Verification — TKT-156: Put an active archive upload link in every image chaser

## Verdict
PENDING — configuration plus live link creation/reuse, message copy and chase logging are proven; upload-to-evidence lifecycle proof remains

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
- The latest production SPA deployment came from `main` `da56628cc87988de6d640cc7256d15b1d8ae6838`, which contains PR 77 and the TKT-167 image-gap correction. `/assets/index-CAyuuESV.js` returned HTTP `200`, and the production response retained the strict CSP.
- Live safe-setting readback: API `BOX_FILEREQUEST_ENABLED=true`, API `BOX_FOLDER_ROOT_ID=392761581105`, Box Function `BOX_ALLOWED_ROOT_ID=392761581105`, and API `BOX_FILE_REQUEST_TEMPLATE_ID=23193724288`. The template identifier is non-secret configuration; the share token is deliberately redacted from this record.
- Signed-in production Chrome proof on AX26039/P40DLN:
  - The case stayed **Not ready** with **Missing images** and zero accepted images; Chasers offered **Image request** rather than incorrectly suppressing image chasing.
  - **Copy prepared** produced an editable/copyable message containing exactly one `https://app.box.com/f/[redacted]` link.
  - Repeating **Copy prepared** reused the same single link; it did not create or append a duplicate.
  - **Log as chased** returned HTTP `201` from `logChase` at `2026-07-13T07:59:25Z`.
- Focused contracts:
  - `api/src/lib/box-file-request-outbox.test.ts` — first create, concurrent ownership, active reuse, transient retry, inactive/expired reactivation, deleted/invalid/terminal-repair replacement and folder-not-ready.
  - `api/src/functions/cases-chase.test.ts` — image/picture chasers require the link, persist its identity and refuse a link from a superseded folder; non-image chasers remain unaffected.
  - `mockup-app/src/components/ChaserPanel-copy.test.tsx` — the editable message and active HTTPS link copy together; a failed link copies/logs nothing.
  - `functions/box-webhook/tests/test_scope_lock.py` and `test_file_request_routes.py` — template/request folder containment, expected-folder lifecycle calls, restricted reactivation fields and a fresh ancestry read despite a stale warm-worker cache.
  - `api/src/functions/internal-evidence-dedup.test.ts` — only a newly inserted Box image satisfies image chasers; a cross-lane archive mirror and redelivery do not.

## Pending / gaps
- Acceptance still requires one unique test-image upload through the request and readback of the resulting Box file, evidence/classification/readiness/chaser state, audit rows, redelivery idempotency and confirmation of zero writes outside the test root.
- Concurrent creation, inactive/expired repair and deleted replacement are covered offline, but those destructive lifecycle variants have not been exercised against the live test request.
- The existing File Request webhook firing is an empirical integration contract, so offline tests cannot certify the real upload event.

## How to re-verify
1. Upload a unique test image through AX26039/P40DLN's active request. Confirm `FILE.UPLOADED` writes one evidence row to the correct case, classification runs, readiness is recomputed, and the linked image chaser becomes responded. Redeliver the event and confirm no duplicate evidence/audit/response transition.
2. In a separate controlled test request, exercise one inactive/expired request and one deleted request; confirm reactivation or one audited replacement generation without exposing either share token.
3. Read back the Box folder tree and audit records to prove all writes stayed beneath `392761581105`; inspect post-deploy telemetry for failures.
