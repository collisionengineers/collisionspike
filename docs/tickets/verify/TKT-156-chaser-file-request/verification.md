# Verification — TKT-156: Put an active archive upload link in every image chaser

## Verdict
PENDING — the core File Request and upload-to-evidence/readiness path is verified live; correct role classification, live repair variants and redelivery idempotency remain

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
- Live upload proof, restricted to authorized Box test root `392761581105`:
  - File `2343931230885` was the first test-scope upload and completed the same folder-resolution, evidence and readiness path.
  - At `2026-07-13T08:17:24Z`, the second upload, file `2343928931602`, landed in folder `399042781700` with HTTP `200`.
  - Box webhook operation `50af22db26d2afa9689d993c86a81a34` returned HTTP `200`. `GET /api/internal/box/case-by-folder/399042781700` returned `200`; metadata and content fetches returned `200`; `POST /api/internal/cases/eec464ce-f32f-45ee-92ac-54b8c6d578db/evidence` returned `200`; the internal audit returned `204`; status evaluation returned `200`; the webhook completed in `2820 ms`.
  - Both files are deliberately mismatched generic image fixtures. This proves transport, evidence persistence and readiness re-evaluation, not correct image-role classification, accepted role coverage or a case-ready outcome.
- Focused contracts:
  - `api/src/lib/box-file-request-outbox.test.ts` — first create, concurrent ownership, active reuse, transient retry, inactive/expired reactivation, deleted/invalid/terminal-repair replacement and folder-not-ready.
  - `api/src/functions/cases-chase.test.ts` — image/picture chasers require the link, persist its identity and refuse a link from a superseded folder; non-image chasers remain unaffected.
  - `mockup-app/src/components/ChaserPanel-copy.test.tsx` — the editable message and active HTTPS link copy together; a failed link copies/logs nothing.
  - `functions/box-webhook/tests/test_scope_lock.py` and `test_file_request_routes.py` — template/request folder containment, expected-folder lifecycle calls, restricted reactivation fields and a fresh ancestry read despite a stale warm-worker cache.
  - `api/src/functions/internal-evidence-dedup.test.ts` — only a newly inserted Box image satisfies image chasers; a cross-lane archive mirror and redelivery do not.

## Acceptance status
- **VERIFIED-LIVE:** approved template configuration; case-folder resolution; one active request/link; repeated copy reuse; exactly one redacted HTTPS link in the editable/copyable message; persisted chase logging; two uploads inside the authorized root; folder-to-case resolution; metadata/content retrieval; evidence persistence; audit write; and readiness re-evaluation.
- **TESTED (offline):** concurrent creation ownership, fail-closed link provisioning, inactive/expired reactivation, deleted/invalid replacement, transient retry, root/folder containment and webhook redelivery deduplication.
- **PENDING:** a live upload whose image content genuinely satisfies a required role; a live inactive/deleted repair; and live redelivery/idempotency readback. Generic fixtures cannot be used to claim correct image roles or case readiness.

## Pending / gaps
- The live webhook, evidence and readiness path is proven twice. Because both fixtures are generic and deliberately mismatched, their role-classification outcome cannot prove that a valid required image is accepted or that the case should become Review-ready.
- Concurrent creation, inactive/expired repair, deleted replacement and redelivery deduplication are covered offline, but those destructive/idempotency variants have not been exercised and read back against the live test request.

## How to re-verify
1. Upload controlled fixtures that genuinely satisfy the case's required image roles. Confirm classification/role assignment, accepted-image count, readiness and the relevant chaser response change only when the content warrants it.
2. In a separate controlled test request, exercise one inactive/expired request and one deleted request; confirm reactivation or one audited replacement generation without exposing either share token.
3. Redeliver one recorded upload event and confirm no duplicate evidence, audit or response transition.
4. Read back the Box folder tree and audit records to prove every write stayed beneath `392761581105`; inspect post-deploy telemetry for failures.

## Independent verification update — 2026-07-14

### Verdict

PENDING

### Evidence

1. **Acceptance 1 — VERIFIED-LIVE for configured template; approval provenance not independently
   reread.** Live API/orchestration settings expose `BOX_FILEREQUEST_ENABLED=true`,
   `BOX_FOLDER_ROOT_ID=392761581105`, and `BOX_FILE_REQUEST_TEMPLATE_ID=23193724288`. Python Box
   Function telemetry shows `copy_file_request` returned 200 at `2026-07-13T07:58:46Z` using template
   `23193724288`. This proves the template works in the live copy path.
2. **Acceptance 2 — VERIFIED-LIVE for one designated case.** For case
   `eec464ce-f32f-45ee-92ac-54b8c6d578db` and case folder `399042781700` (`AX26039`), the API returned
   200 from `caseBoxCopyFileRequest` at `07:58:44Z`, `07:59:10Z`, and `07:59:21Z`. The Box Function
   copied exactly once to File Request `23446312441`, then returned 200 from
   `file_request_lifecycle` for that same ID at `07:59:11Z`, `07:59:23Z`, and `07:59:25Z`. A later
   case reused request `23446960492` across four lifecycle calls. This proves one active copied
   request in the authoritative case folder and later reuse.
3. **Acceptance 3 — VERIFIED-LIVE for active reuse; TESTED (offline) for repair states.** Repeated
   calls above prove reuse. Checked-in tests cover concurrent ownership, retry after 5xx, active
   reuse, and replacement of expired, inactive or deleted requests with audit handling. No repair
   state was manufactured live.
4. **Acceptance 4 — PENDING independent replay, with supporting live/operator evidence.** Existing
   signed-in Chrome evidence says **Copy prepared** produced exactly one redacted active
   `https://app.box.com/f/...` link, repeated preparation reused it, and **Log as chased** completed.
   Telemetry independently confirms `logChase` returned 201 at `07:59:25Z` after lifecycle validation
   of request `23446312441`. Source/rendered tests block copying without a link. This verifier did not
   independently inspect the clipboard.
5. **Acceptance 5 — TESTED (offline), deployed implementation identified.** The Chaser panel uses
   plain fail-closed strings and does not render raw Box/configuration identifiers or a successful
   linkless state. The implementation is in the deployed SPA; failure states were not forced live.
6. **Acceptance 6 — TESTED (offline).** Tests cover copy failures, missing authoritative folder,
   5xx/retry, stale-folder refusal, no copy/log on provisioning failure and replacement/retry. No
   live provisioning failure was induced.
7. **Acceptance 7 — PENDING; successful classification/result chain is not proven.** Two earlier
   files in AX26039 were each preceded by the custom Box facade `upload_file`, so they do not prove
   public File Request ingress. Both reached webhook/evidence/readiness but ended
   `model_content_filter`: `enumerated=2`, `classified=0`, `stamped=0`, `failed=2`,
   `deadLettered=2`, `casesReEvaluated=1`. A later five-file batch appeared in the folder together
   and produced five webhooks with no preceding custom upload call, making File Request ingress a
   strong inference but not direct event-source proof. It produced five internal-evidence 200s and
   five status-evaluate 200s, but all five classifier attempts ended terminal
   `model_content_filter`: `enumerated=5`, `classified=0`, `stamped=0`, `failed=5`,
   `deadLettered=5`, `casesReEvaluated=1`. Role classification succeeded for 0 of 7 observed files;
   no resulting chaser response based on a successfully classified upload was read back.
8. **Acceptance 8 — VERIFIED-LIVE for observed target path; TESTED (offline) for rejection.** Box
   read-only inspection shows folder `399042781700` is active, named `AX26039`, and directly beneath
   configured root `392761581105`. The server validates authoritative case-folder ancestry; tests
   cover missing/stale/outside-root failure. No adversarial live request was attempted.
9. **Acceptance 9 — TESTED (offline) from checked-in suites and ticket record, not rerun.** Recorded
   evidence reports API 66 files/653 tests, SPA 41/468 and Python 250 passing. Current focused rerun
   could not start because this clean worktree has no local Vitest; no dependency install was made.
10. **Acceptance 10 — PENDING.** Live settings, template copy, repeated reuse, test-root folder path,
    existing copied-link evidence and chase logging are established. However, no upload completed
    role classification/stamping, exact public-File-Request origin was not directly proven, resulting
    chaser response was not read back, and there is no enterprise event/inventory proof of zero
    writes outside the configured root.

### Pending / gaps

- Upload an authorized, suitable vehicle-image fixture through the active public File Request and
  prove classification/stamping, evidence, readiness and corresponding chaser response. Current
  observed inputs all ended at the model content filter.
- Prove File Request ingress directly from Box event/audit metadata, not only absence of custom
  `upload_file` calls.
- Exercise one inactive/expired/deleted copied request and verify one replacement plus audit; replay
  an event and prove no duplicate evidence/audit.
- Independently replay the signed-in clipboard flow.
- Establish zero writes outside root `392761581105` from an authoritative event ledger or scoped
  inventory. PostgreSQL and global Box events were unavailable.

### How to re-verify

1. With explicit authorization, upload harmless suitable vehicle images through the designated case’s
   active public File Request under the test root; do not call the custom upload facade.
2. Correlate Box event metadata, webhook, evidence posts and classifier. Require a positive
   classified/stamped outcome, then read evidence, readiness and chaser response.
3. In signed-in Chrome prepare/copy twice and inspect the clipboard: exactly one active HTTPS File
   Request link and the same request identity.
4. Under controlled authorization, inactivate/expire or delete a test request, invoke preparation
   concurrently, and verify exactly one replacement, reuse and audit. Replay one upload event and
   compare evidence/audit counts.
5. Use the Box event ledger or complete scoped inventory to prove every correlated write stayed below
   `392761581105`.

### Confidence + unread surfaces

**High confidence in the PENDING verdict.** Live settings, function inventories, request IDs, folder
ancestry, webhook/evidence/readiness calls and the 0-of-7 terminal classifier outcome were read.
Clipboard behavior and later-batch File Request origin have medium confidence because they rely on
existing operator evidence and inference. Unread surfaces are direct PostgreSQL state, signed-in
clipboard replay, repair audit, authoritative Box event-source metadata and enterprise-wide
outside-root write proof.
