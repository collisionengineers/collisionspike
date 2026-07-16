# Changes — TKT-156: Put an active archive upload link in every image chaser

## Status
Merged, configured, deployed and core-path verified live. The designated AX26039/P40DLN walkthrough proves active-link creation/reuse, editable-message copy, chase logging and two test-root uploads reaching evidence persistence and readiness re-evaluation. The deliberately generic fixtures do not prove correct image-role classification or a case-ready image set; destructive request repair and event-redelivery variants remain offline-only evidence.

## Commits
- `7a2d2eeb1543b25f093e5db29700764549cb030f` — require an active, case-scoped upload link for every image chaser and complete the repair/webhook lifecycle.
- `cc3562ff37bac5c0e557eb690abbffd4b9417ecc` — align older outstanding image drafts to a repaired/replaced link before logging the next chase.
- `3edffdb901916b36f8c9b5eacf0ba13bb76e63d0` — reviewed final PR head; Claude and Codex both returned `PASS` for that exact SHA.
- `ed3eccdc0f4946ce02bfc35dd60952a513880b56` — PR 77 merge commit on `main`.

## Files changed
- `services/data-api/src/features/archive/file-request-outbox.ts`, `services/data-api/src/platform/http/service-client.ts`, `services/data-api/src/features/cases/image-chasers.ts` — durable single-request creation, remote validation, expiry/inactive/deleted repair, folder/template drift handling, and selective image-chaser response.
- `services/data-api/src/features/cases/`, `services/data-api/src/features/` — fail-closed image-chaser logging/copying and new-upload-only response/readiness coupling.
- `services/functions/box-webhook/box_client.py`, `services/functions/box-webhook/function_app.py` — expected-folder lifecycle validation, fresh allowed-root checks and restricted update fields.
- `apps/web/src/shared/ui/ChaserPanel.tsx`, `apps/web/src/features/cases/CaseDetail.tsx` — one image-request choice whose editable message cannot be copied or logged without the active upload link.
- `database/baseline/090_chaser.sql`, `database/baseline/195_box_file_request_outbox.sql`, `database/migrations/2026-07-13-tkt156-chaser-file-request.sql` — persist the request used by a chase and the audited repair reason.
- Focused API, SPA and Box-function tests cover creation, concurrent reuse, terminal/transient repair, root/folder containment, link copy, linkless refusal, webhook redelivery and response marking.

## Summary
- Image and overview-photo chasers now share the same upload-link requirement. A linkless image request cannot be copied or logged.
- The API owns one durable request identity per case. Every reuse reads the remote object, checks active/expiry state and confirms its current folder matches the authoritative case folder.
- Inactive or expired requests are reactivated when possible; deleted, invalid or terminally unreactivatable requests are replaced through one audited outbox generation. Timeouts and 5xx responses stay retryable and do not create a second generation.
- File Request templates and destination folders are checked under the configured write root. Reuse bypasses the warm ancestry cache so a folder moved after an earlier check cannot remain writable.
- A newly persisted image uploaded through the existing webhook lane marks only outstanding image chasers responded and queues the existing readiness recompute. Webhook redelivery, classifier re-stamps and archive mirrors of pre-existing bytes do not falsely satisfy a later chase.
- The TKT-156 Postgres delta was applied live and read back successfully. `chaser.box_file_request_id`, `chaser.box_file_request_url`, `box_file_request_outbox.repair_reason`, and `ix_chaser_case_file_request_open` are present.
- The Box Function was deployed from the reviewed merged tree at `2026-07-13T04:43:25Z`; all `12` routes registered, including `copy_file_request` and `file_request_lifecycle`.
- The latest production SPA deployment is from `main` `da56628cc87988de6d640cc7256d15b1d8ae6838`, which contains TKT-156 and the TKT-167 image-gap correction. `/assets/index-CAyuuESV.js` returned HTTP `200`, and the production response retained the strict CSP.
- Live safe-setting readback confirms `BOX_FILEREQUEST_ENABLED=true`, `BOX_FOLDER_ROOT_ID=392761581105`, Box Function `BOX_ALLOWED_ROOT_ID=392761581105`, and approved template `BOX_FILE_REQUEST_TEMPLATE_ID=23193724288`. The identifier is non-secret configuration; no File Request share token is recorded in repository documentation.
- In the signed-in production SPA, AX26039/P40DLN remained **Not ready** with **Missing images** and zero accepted images, while Chasers correctly offered **Image request**. **Copy prepared** produced an editable/copyable message containing exactly one `https://app.box.com/f/[redacted]` link. Repeating the action reused the same single link rather than creating or appending another request.
- **Log as chased** completed through `logChase` with HTTP `201` at `2026-07-13T07:59:25Z`. This proves the case-scoped active link can be used for a persisted chase without incorrectly moving the zero-image case out of Not ready.
- Two deliberately generic image fixtures were then uploaded through the active request inside authorized test root `392761581105`. File `2343931230885` completed the folder-to-case/evidence/readiness path first. At `2026-07-13T08:17:24Z`, file `2343928931602` landed in folder `399042781700`; webhook operation `50af22db26d2afa9689d993c86a81a34` resolved the folder to case `eec464ce-f32f-45ee-92ac-54b8c6d578db`, fetched metadata/content, persisted evidence, wrote the audit, ran status evaluation and returned HTTP `200` in `2820 ms`.
- This is transport, evidence-persistence and readiness-re-evaluation proof only. The fixtures intentionally do not match the case's required image roles, so they neither demonstrate correct role classification nor justify moving the case to Review.
- No Outlook data was mutated. Both Box uploads stayed inside test root `392761581105`; no Box content was written outside that root.
