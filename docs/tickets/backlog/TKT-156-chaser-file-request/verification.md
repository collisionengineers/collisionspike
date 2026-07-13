# Verification — TKT-156: Put an active archive upload link in every image chaser

## Verdict
TESTED (offline)

## Evidence
- Rebased implementation commit: `7a2d2eeb1543b25f093e5db29700764549cb030f` on current `origin/main` (`ab2d677`).
- API full suite: `66` files / `653` tests passed; `npm run build` passed.
- SPA full suite: `41` files / `468` tests passed; production Vite build passed (existing large-chunk warning only).
- Box Function full suite: `250` tests passed.
- Repository-wide `node verify-all.mjs`: `8` passed / `0` failed / `13` documented skips; includes SPA, API, domain and orchestration builds/tests. The aggregate gate skipped Python because no local `.venv`, so the separately run `250`-test Box Function result above is the Python proof for this ticket.
- Ticket, documentation-link and shared-skill checks passed.
- Focused contracts:
  - `api/src/lib/box-file-request-outbox.test.ts` — first create, concurrent ownership, active reuse, transient retry, inactive/expired reactivation, deleted/invalid/terminal-repair replacement and folder-not-ready.
  - `api/src/functions/cases-chase.test.ts` — image/picture chasers require the link, persist its identity and refuse a link from a superseded folder; non-image chasers remain unaffected.
  - `mockup-app/src/components/ChaserPanel-copy.test.tsx` — the editable message and active HTTPS link copy together; a failed link copies/logs nothing.
  - `functions/box-webhook/tests/test_scope_lock.py` and `test_file_request_routes.py` — template/request folder containment, expected-folder lifecycle calls, restricted reactivation fields and a fresh ancestry read despite a stale warm-worker cache.
  - `api/src/functions/internal-evidence-dedup.test.ts` — only a newly inserted Box image satisfies image chasers; a cross-lane archive mirror and redelivery do not.

## Pending / gaps
- No live Box mutation was attempted. The approved template still needs to be created inside test root `392761581105`, and its non-secret ID must be supplied through the existing app configuration.
- The schema delta has not been applied and the API, SPA and Box Function changes have not been deployed.
- Acceptance still requires a signed-in, designated-test-case proof: message/link, one upload through that link, resulting Box file/evidence/classification/readiness/chaser state, audit rows and confirmation of zero writes outside the test root.
- The existing File Request webhook firing is an empirical integration contract, so offline tests cannot certify the real upload event.

## How to re-verify
1. Create/approve the File Request template under `392761581105`, set `BOX_FILE_REQUEST_TEMPLATE_ID` through the existing configuration path, and record the template/folder IDs without exposing credentials.
2. Apply `migration/assets/schema/deltas/2026-07-13-tkt156-chaser-file-request.sql`; deploy the Box Function, API and SPA from the reviewed head.
3. On a test case whose authoritative archive folder is under `392761581105`, copy an image chaser. Confirm the visible and clipboard messages contain exactly one active `https://app.box.com/f/...` link.
4. Repeat and concurrently retry. Confirm the same request ID/link is reused. Exercise one inactive/expired request and one deleted request; confirm reactivation or one audited replacement generation.
5. Upload a unique test image through the request. Confirm `FILE.UPLOADED` writes one evidence row to the correct case, classification runs, readiness is recomputed, and the linked image chaser becomes responded. Redeliver the event and confirm no duplicate evidence/audit/response transition.
6. Read back the Box folder tree and audit records to prove all writes stayed beneath `392761581105`; inspect post-deploy telemetry for failures.
