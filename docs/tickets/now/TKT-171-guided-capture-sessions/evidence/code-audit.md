# Code audit — TKT-171 guided capture sessions

Date: 2026-07-13
Branch inspected: `codex/guided-capture-server`

This is source evidence only. It does not prove deployment or live behavior.

## Canonical contract

- `api/openapi/capture.v1.yaml` contains ten operation IDs: staff create/list/replace/cancel and
  public exchange/renew/manifest/create-upload/complete-upload/submit.
- The status vocabulary is finite (`open`, `complete`, `expired`, `revoked`, `locked`). Upload intent
  and submit require an `Idempotency-Key` header.
- The upload-intent contract documents the eight-per-shot and sixty-per-session reservation limits,
  the stable-key replay exception and the `423 capture_locked` exhaustion response.
- `scripts/check-capture-contract.mjs` and `.github/workflows/capture-contract.yml` validate and
  regenerate `api/src/generated/capture-api.ts` to detect drift.
- Exchange and submit document their exact `Set-Cookie` headers; renewal is authenticated only by the
  protected host cookie and has no request body. `ClientCaptureObservation` is strict and bounded, and
  upload completion 200 documents only final `accepted`/`pending_review` outcomes.

## Staff surface

- `mockup-app/src/components/GuidedPhotoRequestPanel.tsx` issues approved plans with bounded expiry,
  lists summaries and exposes replace/cancel controls only for open sessions.
- `mockup-app/src/components/ChaserPanel.tsx` consumes a newly returned URL once to build an editable
  guided-photo request. The normal archive-upload template remains present.
- `mockup-app/src/data/rest-client.ts` calls the four authenticated staff routes. The list DTO has no
  URL or secret field.
- The Case detail Evidence action routes the handler to the Chasers surface; the terminal-case state
  disables issuing a new request.
- The staff image query explicitly includes excluded `public_guided_capture` Evidence for review even
  after staff reject it, as required by the ticket acceptance. Its card distinguishes the initial
  capture hold from a staff exclusion in plain language without exposing the internal source label;
  the ordinary Evidence PATCH remains the only path to include and accept it for EVA.

## Public boundary and storage

- `api/src/lib/capture-auth.ts` stores only SHA-256 hashes of 256-bit bootstrap/resume secrets and signs
  short-lived session/generation-scoped access. Resume cookies are `HttpOnly`, `Secure`,
  `SameSite=Strict`, host-only and bounded by session expiry; renewal replay, expiry and generation
  invalidation are covered without logging the cookie or plaintext token.
- `api/src/functions/capture.ts` registers public routes with anonymous platform auth but performs its
  own session authorization before returning a manifest or accepting an upload/submit operation.
- `api/src/lib/blob.ts` adds one-path user-delegation SAS creation through the existing managed
  identity credential; no account key is returned.
- Upload completion checks Blob properties before a byte-bounded download, computes SHA-256, compares
  declared and actual size, reuses structural content validation and requires decoded image dimensions.
  A fenced validation lease prevents a stale worker from selecting after reclaim. Validated bytes are
  promoted to a create-only, content-addressed object outside the browser SAS path before selection.
- Required client guidance observations are normalized, rules-version checked, included in idempotency
  comparison and stored as untrusted `client_quality`. Separate bounded `server_quality` records the
  structural format/hash/decode/dimension result; a client `ready` claim never bypasses those checks or
  the `pending_review` result.
- Every fresh upload reservation locks the session row, checks stable-key replay first, then counts and
  inserts under that lock. Eight attempts per shot or sixty for the session are the hard ceilings. The
  first over-limit request locks and audits the session and invalidates resume access; same-key recovery
  remains available without another row or counter increment.
- Completion validation is synchronous in this pilot. The lease protects concurrent/retried HTTP work;
  a dedicated asynchronous worker remains an explicit rollout gap rather than an implemented claim.
- Manifest progress prefers the selected asset, otherwise the latest attempt, and maps internal states
  to safe recovery statuses with only a generic rejection reason.
- Submission resolves and locks the complete durable merge lineage in global order, retargets to an
  active survivor or persistently locks the session, materialises selected photos as excluded/review-
  pending evidence, then requests archive mirror and readiness work and writes strict audit.
- `api/src/functions/capture-cleanup.ts` expires sessions and removes only capture-owned unmaterialised,
  orphaned or redundant objects after the configured retention window. Canonical Evidence storage paths
  are excluded. It also deletes expired/terminal resume-token hashes in a bounded skip-locked batch.

## Data model

- `196_capture_session.sql` defines `capture_session`, `capture_session_resume_token`,
  `capture_session_shot` and `capture_asset`, with
  expiry/session indexes, exact session-shot ownership, one selected non-repeatable shot, one evidence
  row per asset and forced RLS. The app can delete only resume-token rows for lifecycle invalidation;
  capture sessions, shots and assets retain the non-delete restriction.
- `2026-07-13-guided-capture.sql` is the additive live delta candidate. The canonical enum/lookups,
  evidence linkage and `900_constraints.sql` were updated with the same capture vocabulary.

## Not established by this audit

- No live schema or application setting was read or changed.
- No edge, WAF, DNS, CORS, storage-container lifecycle or rate-limit configuration was inspected.
- No real upload permission was minted and no staging object was written.
- No staff-to-public-to-evidence end-to-end run or physical-device camera run was performed.
- The companion CollisionCapture client and its draft PR require their own browser/device evidence;
  this audit covers the authoritative CollisionSpike side only.
