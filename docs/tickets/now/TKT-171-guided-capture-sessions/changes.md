# Changes — TKT-171: Add secure guided photo capture sessions

## Status

Implemented as an offline branch candidate on `codex/guided-capture-server`. The contract, staff UI,
public API and schema remain subject to integration review and live acceptance. No database delta,
app setting, cloud resource or live data was changed by this branch.

## Contract

- `api/openapi/capture.v1.yaml` defines the ten staff/public operations, finite status/error shapes,
  bounded shot-plan/expiry inputs and required `Idempotency-Key` headers.
- Bootstrap exchange sets a host-only `__Host-collisioncapture-resume` cookie with `HttpOnly`,
  `Secure`, `SameSite=Strict` and a lifetime no longer than the session. The bodyless renewal route
  uses that cookie to mint another short-lived bearer; successful submission clears it. The resume
  secret is never returned in JSON or stored in plaintext.
- Upload intent requires a strict, versioned and size-bounded `ClientCaptureObservation`. Its route,
  disposition, allow-listed issue, normalized signals and stable-frame count are advisory telemetry,
  not acceptance evidence. Upload completion is synchronous in this pilot and its 200 response no
  longer advertises the unreachable `validating` state.
- Contract responses match the runtime status sets, including the existing staff bearer-error shape;
  create fields remain optional because the server deliberately defaults the essential plan and a
  72-hour expiry. Manifest string bounds match the case schema.
- `api/src/generated/capture-api.ts`, `scripts/check-capture-contract.mjs` and
  `.github/workflows/capture-contract.yml` make generated types and contract validation reproducible.
- The contract is authoritative for the companion CollisionCapture client; staff/public transport
  changes must update the spec and generated consumers together.

## Staff workflow

- `packages/domain/src/dto/capture.ts` adds staff-safe session summaries and create/replace/cancel
  results. Existing list responses contain no capture secret.
- `mockup-app/src/data/rest-client.ts` and the data hooks expose the authenticated staff operations.
- `GuidedPhotoRequestPanel.tsx`, `ChaserPanel.tsx` and the Case detail Evidence/Chasers integration add
  plan/expiry selection, issue/replace/cancel controls and a one-time editable chaser draft while
  retaining the existing archive upload link.
- Rendered and data-client tests cover create, list, replace, cancel, chaser drafting and plain-language
  copy.
- Excluded `public_guided_capture` Evidence remains visible in the staff image-review list and carries
  the plain warning “Review this submitted photo before using it for EVA.” The internal source label is
  not shown. Existing staff PATCH controls explicitly include/accept it before EVA use.

## Public API and data model

- `api/src/functions/capture.ts` registers staff issue/list/replace/cancel routes and public
  secret-exchange, access-renewal, manifest, upload-intent, upload-completion and submission routes
  behind capture configuration gates.
- Staff operations and public access have independent default-off kill switches
  (`CAPTURE_SESSIONS_ENABLED` and `PUBLIC_CAPTURE_ENABLED`). Direct Blob upload remains separately
  gated by `CAPTURE_DIRECT_UPLOAD_ENABLED`. Each new session snapshots the validated
  `CAPTURE_GUIDANCE_MODE` rung (`off`, `shadow`, `advisory` or `enforced`; default `advisory`).
- `api/src/lib/capture-auth.ts` and `capture-plans.ts` keep secret/access handling and shot-plan rules
  independently testable. Public access is session scoped; replacement/cancellation advances the
  token generation. Resume-token hashes are bounded to eight per session, invalidated on
  replace/cancel/lock/submit and removed by terminal/expiry cleanup.
- Manifest recovery chooses the selected asset for a shot, otherwise its latest attempt. It exposes
  only safe `retryable`, `validating`, `rejected`, `accepted` or `pending_review` progress and a generic
  rejection message, so response loss and stale validation leases can converge without exposing
  filenames, validation codes or storage paths.
- Upload idempotency includes the normalized client observation. The observation must match the
  session's pinned rules version and is persisted in `capture_asset.client_quality`; changing it while
  reusing a key is a conflict. Server-side format/hash/decode/dimension outcomes are separately stored
  as bounded `structural-v1` observations in `server_quality` and exclusively drive structural checks.
- `api/src/lib/blob.ts` mints managed-identity user-delegation upload permissions for one staged path.
  `upload-validate.ts` is reused for structural image checks before an asset can be selected.
- Validation claims use a fenced UUID attempt and expiring lease. A crashed worker can be reclaimed
  after five minutes; every rejection, retry reset and final selection compares the attempt token so
  an old worker cannot persist after a reclaim.
- Validation currently runs synchronously in the completion HTTP request. The lease remains because it
  fences retries and provides a safe migration seam, but a dedicated asynchronous validation worker is
  still required before claiming resilient high-volume processing.
- Submission locks the case, requires the selected mandatory shots, creates review-pending evidence
  with original path/hash metadata, requests archive mirror work, requests readiness recomputation and
  writes strict audit in the same transaction.
- Submission follows only a verified `mergedInto` lineage after acquiring every case advisory lock and
  row lock in the global order. It transactionally retargets the session to an active survivor and
  audits that move. A missing/malformed lineage or terminal survivor persistently locks and audits the
  session for staff resolution. A previously completed same-key replay returns its stored result before
  inspecting current case status.
- The existing case-merge transaction detects the additive capture table safely, locks source capture
  sessions and their assets in ID order before inbound/evidence rows, reparents every session to the
  survivor without rotating its token generation, and writes one strict retarget audit per session.
  When same-hash Evidence is coalesced, locked capture assets are repointed from the retired duplicate
  to the surviving Evidence row. Completion still resolves lineage under lock so a merge racing an
  in-flight validation remains self-healing.
- `capture-cleanup.ts` adds a daily, `CAPTURE_CLEANUP_ENABLED`-gated retention consumer.
  `CAPTURE_RETENTION_DAYS` is validated (default 30, range 1–3650). It marks expired sessions and uses
  managed identity to remove only post-retention capture staging/validated objects. It also removes a
  deterministic promoted orphan left by a crashed validator and redundant same-hash dedupe objects,
  while excluding any path referenced as canonical `Evidence.storage_path`. A deterministic staging
  path also recovers failed immediate deletion after promotion/materialisation; when linked Evidence
  has a null storage path after purge, cleanup deletes staging only. Successful immediate deletion is
  marked on the asset, so ordinary materialised throughput never consumes the 100-item daily orphan
  budget; only unknown/failed staging cleanup and genuinely redundant objects enter that sweep.
  Durable cleanup stamps and identifier-free aggregate logs provide operational evidence. Expiry locks
  a bounded ID-ordered batch with `SKIP LOCKED`; locked sessions are retention candidates, and failed
  object deletion records a bounded durable retry/backoff without starving later candidates in the
  batch. A separate bounded `SKIP LOCKED` delete removes expired or terminal resume-token hashes.
- `migration/assets/schema/196_capture_session.sql` and
  `migration/assets/schema/deltas/2026-07-13-guided-capture.sql` add the session, requested-shot and
  resume-token, requested-shot and staged-asset tables, evidence linkage, audit choices, constraints,
  indexes, forced RLS and app-role grants. Delete remains denied to ordinary capture tables; the app
  role receives delete only on resume tokens for bounded lifecycle invalidation.

## Deliberately unchanged

- The existing staff Add evidence route, archive upload link and evidence review decision semantics.
- Automated damage, part or viewpoint recognition.
- Live Azure infrastructure, DNS, public edge/WAF policy, storage-container policy and app settings.
- Box content or metadata. The later live proof must remain beneath the designated test root.
