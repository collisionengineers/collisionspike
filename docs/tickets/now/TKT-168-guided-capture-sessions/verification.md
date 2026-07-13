# Verification — TKT-168: Add secure guided photo capture sessions

## Verdict

PENDING — the source candidate is not deployed. Offline contract and staff-UI checks do not prove the
database delta, public ingress, managed-identity upload, physical camera flow or live evidence
materialisation.

## Offline evidence recorded so far

- OpenAPI validation and generated-type drift checking passed for the canonical capture contract.
- The focused Case detail, chaser, guided-request and REST-client tests passed, including rendered
  issue/replace/cancel behavior and one-time link drafting.
- The production SPA build passed after the staff workflow was added.
- Public auth, shot-plan, schema and route tests exist on the implementation branch; their final
  focused and full-suite results must be recorded after the server integration review completes.
- Ticket and documentation-link validators are run after this ticket is added; their result belongs
  in the implementation hand-off, not a live verdict.

## Honest gaps

- `2026-07-13-guided-capture.sql` has not been applied to any live database.
- The API and SPA changes have not been deployed; `CAPTURE_ENABLED`, direct-upload and public-base-URL
  settings have not been configured live.
- The production public hostname, edge/WAF tier, exact CORS policy, rate limits, staging-container
  lifecycle and observability policy are not yet provisioned and verified.
- No managed-identity user-delegation SAS has been minted against the intended live staging container.
- No physical iPhone/Safari or Android/Chrome acceptance run has been recorded.
- No public session has been created against a designated test case, and no database row, Blob object,
  canonical evidence record, audit, readiness generation or archive file has been created by this
  implementation pass.
- Automated vehicle/viewpoint/part/damage models are outside this ticket and have no production claim.

## Live re-verification

1. Review and merge the contract, staff UI, public API and schema as one compatibility-checked set;
   prove the generated client has no drift from `capture.v1.yaml`.
2. Take a backup, apply the guided-capture delta, and verify table/column/constraint parity, forced RLS,
   non-delete app grants and exact audit-choice values.
3. Provision the dedicated public ingress and staging policy. Verify HTTPS, exact allowed origins,
   cache prevention, WAF/request limits, throttling, retention/cleanup and PII-free telemetry before
   enabling capture.
4. Configure the public base URL and managed-identity storage permissions. Mint one upload permission
   and prove it can create only its one object, cannot list/read/delete/overwrite another object, and
   expires on schedule.
5. From a designated non-terminal test case, issue an essential-plan link. Confirm the list shows the
   non-secret summary, the chaser draft is editable, and browser history/storage/logs contain no secret
   after exchange.
6. Replace the link and prove the old bootstrap/access values fail. Cancel the replacement and prove it
   fails. Issue a third short-lived link and prove expiry behavior without changing the case.
7. On physical Safari/iPhone and Chrome/Android, complete camera permission, denial/fallback, retake,
   take-anyway, accept, app-background/resume and low-memory recovery runs. Confirm every media track
   stops on close, fallback and unmount.
8. Upload valid JPG/PNG/WebP fixtures and submit. Verify declared/server hashes, dimensions and paths;
   selected staged assets; canonical evidence rows excluded pending review; one strict audit; archive
   outbox work; readiness recomputation; and one mirror beneath the designated archive test root.
9. Replay upload and submit keys, double-submit concurrently and replace one shot. Prove there is one
   selected asset per non-repeatable shot and no duplicate evidence, archive work or audit.
10. Try a MIME/magic mismatch, truncated image, wrong hash/size, over-limit image, wrong-session asset,
    unknown shot, missing mandatory shot, retired case, unauthenticated staff call and revoked/expired
    public access. Each must fail before canonical materialisation and leave recoverable/cleanable
    staging state without exposing internal identifiers.
11. Independently inspect the deployed SPA, API telemetry, Postgres rows, Blob objects and archive test
    folder, then record one concrete artifact per acceptance line before moving this ticket to `verify`
    or `done`.
