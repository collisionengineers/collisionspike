# Changes — TKT-156: Put an active archive upload link in every image chaser

## Status
Implemented and tested offline on `codex/tkt-156-chaser-file-request`; deployment, schema application and the designated test-folder proof remain pending.

## Commits
- `7a2d2eeb1543b25f093e5db29700764549cb030f` — require an active, case-scoped upload link for every image chaser and complete the repair/webhook lifecycle.
- `cc3562ff37bac5c0e557eb690abbffd4b9417ecc` — align older outstanding image drafts to a repaired/replaced link before logging the next chase.

## Files changed
- `api/src/lib/box-file-request-outbox.ts`, `api/src/lib/functions-client.ts`, `api/src/lib/image-chasers.ts` — durable single-request creation, remote validation, expiry/inactive/deleted repair, folder/template drift handling, and selective image-chaser response.
- `api/src/functions/cases.ts`, `api/src/functions/internal.ts` — fail-closed image-chaser logging/copying and new-upload-only response/readiness coupling.
- `functions/box-webhook/box_client.py`, `functions/box-webhook/function_app.py` — expected-folder lifecycle validation, fresh allowed-root checks and restricted update fields.
- `mockup-app/src/components/ChaserPanel.tsx`, `mockup-app/src/screens/CaseDetail.tsx` — one image-request choice whose editable message cannot be copied or logged without the active upload link.
- `migration/assets/schema/090_chaser.sql`, `migration/assets/schema/195_box_file_request_outbox.sql`, `migration/assets/schema/deltas/2026-07-13-tkt156-chaser-file-request.sql` — persist the request used by a chase and the audited repair reason.
- Focused API, SPA and Box-function tests cover creation, concurrent reuse, terminal/transient repair, root/folder containment, link copy, linkless refusal, webhook redelivery and response marking.

## Summary
- Image and overview-photo chasers now share the same upload-link requirement. A linkless image request cannot be copied or logged.
- The API owns one durable request identity per case. Every reuse reads the remote object, checks active/expiry state and confirms its current folder matches the authoritative case folder.
- Inactive or expired requests are reactivated when possible; deleted, invalid or terminally unreactivatable requests are replaced through one audited outbox generation. Timeouts and 5xx responses stay retryable and do not create a second generation.
- File Request templates and destination folders are checked under the configured write root. Reuse bypasses the warm ancestry cache so a folder moved after an earlier check cannot remain writable.
- A newly persisted image uploaded through the existing webhook lane marks only outstanding image chasers responded and queues the existing readiness recompute. Webhook redelivery, classifier re-stamps and archive mirrors of pre-existing bytes do not falsely satisfy a later chase.
- No Outlook data was mutated and no live Box write was made during implementation.
