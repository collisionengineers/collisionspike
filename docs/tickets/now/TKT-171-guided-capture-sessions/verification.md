# Verification — TKT-171: Add secure guided photo capture sessions

## Verdict

PENDING — the source candidate is not deployed. Offline contract and staff-UI checks do not prove the
database delta, public ingress, managed-identity upload, physical camera flow or live evidence
materialisation.

## Offline evidence recorded so far

- OpenAPI validation and generated-type drift checking passed for the canonical capture contract.
- The focused Case detail, chaser, guided-request and REST-client tests passed, including rendered
  issue/replace/cancel behavior and one-time link drafting.
- The production SPA build passed after the staff workflow was added.
- Final capture hardening checks passed across auth, shot plans, schema, Blob boundaries, merge locking,
  retention and routes. The full API suite, API TypeScript build, OpenAPI lint and generated-contract
  drift check also passed; exact counts are recorded in the implementation hand-off and PR checks.
- Focused coverage additionally proves protected-cookie renewal/replay/expiry/generation invalidation,
  strict client-observation bounds and idempotency mismatch, separate server structural observations,
  selected-or-latest manifest recovery, staff visibility/acceptance of pending guided capture and the
  plain-language Evidence-card warning.
- Upload-reservation tests prove both documented ceilings, lock/audit/resume invalidation on exhaustion,
  stable-key recovery without another count/row, and two concurrent fresh keys serialising at the final
  per-shot slot without disclosing a SAS after the session locks.
- Guided-evidence tests prove that the initial capture hold and a later staff exclusion both stay visible,
  while the card presents distinct plain-language warnings and excluded rows remain unusable for EVA.
- Ticket and documentation-link validators pass for this active ticket.

## Honest gaps

- `2026-07-13-guided-capture.sql` has not been applied to any live database.
- The API and SPA changes have not been deployed; `CAPTURE_SESSIONS_ENABLED`,
  `PUBLIC_CAPTURE_ENABLED`, `CAPTURE_DIRECT_UPLOAD_ENABLED`, `CAPTURE_CLEANUP_ENABLED`,
  `CAPTURE_GUIDANCE_MODE`, `CAPTURE_RETENTION_DAYS` and `CAPTURE_PUBLIC_BASE_URL` have not been
  configured live.
- The production public hostname, edge/WAF tier, exact CORS policy, rate limits, staging-container
  lifecycle and observability policy are not yet provisioned and verified.
- No managed-identity user-delegation SAS has been minted against the intended live staging container.
- Upload validation currently executes synchronously in the completion HTTP request. The fenced lease
  is implemented and reclaimable, but no dedicated queue/worker, worker retry policy or worker
  observability has been built or live-proven for resilient high-volume processing.
- No physical iPhone/Safari or Android/Chrome acceptance run has been recorded.
- No public session has been created against a designated test case, and no database row, Blob object,
  canonical evidence record, audit, readiness generation or archive file has been created by this
  implementation pass.
- Automated vehicle/viewpoint/part/damage models are outside this ticket and have no production claim.

## Live re-verification

1. Review and merge the contract, staff UI, public API and schema as one compatibility-checked set;
   prove the generated client has no drift from `capture.v1.yaml`.
2. Take a backup, apply the guided-capture delta, and verify table/column/constraint parity, forced RLS,
   non-delete app grants, the narrow resume-token delete exception and exact audit-choice values.
3. Provision the dedicated public ingress and staging policy. Verify HTTPS, exact allowed origins,
   cache prevention, WAF/request limits, throttling, retention/cleanup and PII-free telemetry before
   enabling capture.
4. Configure the public base URL and managed-identity storage permissions. Mint one upload permission
   and prove it can create only its one object, cannot list/read/delete/overwrite another object, and
   expires on schedule.
5. From a designated non-terminal test case, issue an essential-plan link. Confirm the list shows the
   non-secret summary, the chaser draft is editable, and browser history/storage/logs contain no secret
   after exchange. Confirm only an `HttpOnly`, `Secure`, `SameSite=Strict`, host-only resume cookie is
   created, its expiry is bounded by the session and public responses are non-cacheable.
6. Renew twice without a request body and prove each short bearer is session scoped. Replace the link
   and prove the old bootstrap/access/resume values fail. Cancel the replacement and prove it fails.
   Issue a third short-lived link and prove cookie/session expiry behavior without changing the case.
7. On physical Safari/iPhone and Chrome/Android, complete camera permission, denial/fallback, retake,
   take-anyway, accept, app-background/resume and low-memory recovery runs. Confirm every media track
   stops on close, fallback and unmount.
8. Upload valid JPG/PNG/WebP fixtures and submit. Verify declared/server hashes, dimensions and paths;
   pinned client-observation rows remain advisory; bounded server structural observations; selected
   staged assets; canonical evidence rows excluded pending review; staff review visibility and warning;
   explicit staff include/accept; one strict audit; archive outbox work; readiness recomputation; and
   one mirror beneath the designated archive test root.
9. Replay upload and submit keys, double-submit concurrently and replace one shot. Prove there is one
    selected asset per non-repeatable shot and no duplicate evidence, archive work or audit. Reuse an
    upload key with changed client observations and prove it conflicts. Lose upload/completion responses,
    refresh the manifest and prove selected-first/latest-attempt progress converges with no internal data.
    Fill the eighth reservation for one shot and the sixtieth for a session, then race two fresh keys:
    prove the first over-limit request locks/audits once and invalidates resume access, while a matching
    stable-key retry at the ceiling still recovers the existing reservation without another row.
10. Interrupt validation after claim and after immutable promotion. After the five-minute lease, prove
    a new attempt can reclaim the asset and the old attempt cannot reject, select or audit it. Run the
    retention consumer past its configured cutoff and prove it deletes staging, promoted-orphan and
    redundant dedupe objects but never the path held by canonical Evidence. Force one object deletion
    failure and prove the durable backoff is advanced while later candidates continue; confirm locked
    sessions also age into cleanup and expiry batches skip rows held by another transaction. Also prove
    a failed immediate staging delete is recovered after materialisation and a purged/null Evidence
    storage path causes staging-only deletion. Confirm successful immediate deletion stamps the asset
    and prevents normal materialised throughput from entering the bounded orphan batch. Until a
    dedicated validation worker exists, also load-test the synchronous completion timeout envelope and
    do not claim durable asynchronous processing.
11. Merge a capture case before submit. Prove the merge transaction locks source sessions in ID order,
    then assets before Evidence, reparents all session states to the survivor without rotating token
    generations, and emits one strict retarget audit per session. For a same-hash collision, prove any
    completed capture asset is repointed from the retired duplicate Evidence to the survivor. Race
    completion against merge and prove lineage locks remain in global order and evidence lands only on
    the survivor. Prove a missing or terminal survivor leaves a durable locked session and invalidates
    the public generation; a completed same-key replay must still return its stored result.
12. Try a MIME/magic mismatch, truncated image, wrong hash/size, over-limit image, wrong-session asset,
    unknown shot, missing mandatory shot, retired case, unauthenticated staff call and revoked/expired
    public access. Each must fail before canonical materialisation and leave recoverable/cleanable
    staging state without exposing internal identifiers.
13. Independently inspect the deployed SPA, API telemetry, Postgres rows, Blob objects and archive test
    folder, then record one concrete artifact per acceptance line before moving this ticket to `verify`
    or `done`.
