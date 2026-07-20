# Guided capture (public photo-capture PWA)

Status: both sides of this flow now live in this repository. The server (schema, public/staff API
routes, staff SPA panel — TKT-200) and the browser client (`apps/capture-web/`, merged from the former
`collisioncapture` repo — see [ADR-0007's amendment](../adr/0007-receipt-of-images.md) and the merge
ADR) are one codebase. **This is a repository-structure consolidation, not a selection of in-house
guided capture as the committed image-receipt channel** — that choice remains open per ADR-0007;
commercial guided-capture products remain live alternatives.

**Known live risk — not resolved by this merge:** `PUBLIC_CAPTURE_ENABLED`, `CAPTURE_SESSIONS_ENABLED`,
and `CAPTURE_DIRECT_UPLOAD_ENABLED` are live-ON in production without the documented Front Door
ingress-lockdown prerequisite (TKT-159's live-facts audit; operator decision 2026-07-20: leave exposed,
document only, no mutation). See `LIVE_FACTS.json`'s `safetyGates.publicCapture` entry and
[TKT-159](../tickets/now/TKT-159-feature-gate-intent-audit/) before treating this flow as fully hardened.

## Runtime shape

```text
staff app -> Data API -> capture session (hashed bootstrap secret)
                      -> SMS/email link
public mobile browser -> capture-web -> public capture API
                                     -> short-lived upload intent (exact-object SAS)
                                     -> evidence Blob
                                     -> evidence row + audit event
```

## Responsibilities

**`apps/capture-web/` (browser):**
- Opens a tokenized link, loads a safe capture manifest, guides the user through required/recommended
  photo slots, validates obvious local file issues, persists draft progress locally (IndexedDB).
- Uploads while foregrounded; resumes from the protected cookie when reopened without a bootstrap
  fragment; reconciles local progress with the authoritative manifest after recovery/lifecycle events.
- Requests idempotent submission only after required photos are accepted or pending staff review — the
  Data API remains authoritative for marking a session complete.
- Guided in-page camera analysis (exposure/contrast/sharpness/motion/stability, ~5Hz on a preview) and
  an OS/file-picker fallback (checks decoded brightness/contrast/sharpness after selection) are both
  purely deterministic today — neither detects a vehicle, viewpoint, part, or damage. The manifest's
  guidance mode (`off`/`shadow`/`advisory`/`enforced`) controls how those checks are *presented*, never
  whether evidence capture is possible — the take-anyway/OS-fallback path always remains available.

**Data API (server, `services/data-api/`):**
- Mints opaque, high-entropy capture links; stores only token hashes.
- Enforces expiry, revocation, case scope, rate limits, and upload policy.
- Issues short-lived (5-minute), exact-object, create/write-only user-delegation SAS upload intents.
- Verifies completed uploads before evidence rows are written; re-evaluates case image readiness after
  uploads.

**Code boundaries:** `apps/capture-web/src/camera` owns browser media access and the camera dialog;
`packages/capture-core` owns pure deterministic guidance/stability rules; `packages/capture-contracts`
generates browser transport types directly from the canonical `contracts/capture.v1.yaml`
(no cross-repo vendoring); the Data API owns cases, capture sessions,
public authorization, validation, evidence materialisation, readiness, retention, Box mirroring, and
audit. Future vehicle/viewpoint/damage detection must sit behind a testable vision-runtime interface
(`apps/capture-web/src/vision/visionRuntime.ts` is an inert seam today, not a live capability) — guidance
rules must not depend directly on a particular model runtime.

## Integration boundary (capture.v1 contract)

CollisionSpike owns the canonical OpenAPI document (`contracts/capture.v1.yaml`) and the server
implementation. `npm run contract:capture:check` fails when either generated target (the server's
`services/data-api/src/generated/capture-api.ts` or the browser's
`packages/capture-contracts/src/generated.ts`) drifts from it. Browser-only draft-progress fields and
the explicit development mock upload intent are declared separately in
`packages/capture-contracts/src/index.ts` — not part of the HTTP contract. Every public route may
answer `429` with `Retry-After` and the `capture_retryable` problem code; the client already treats 429
as retryable. The public browser never receives an internal case ID, and never sends the bootstrap
secret in a path, query string, log, or telemetry event.

**Staff session controls** — `POST/GET /api/cases/{caseId}/capture-sessions`,
`POST /api/capture-sessions/{sessionId}/{rotate,revoke}` (staff bearer auth). The create response's URL
fragment (`#capture=<256-bit-bootstrap-secret>`) is seen only by the browser; the server stores its hash.

**Public flow** — `POST /api/public/capture/exchange` (fragment secret → 15-minute access token, sets
the `__Host-collisioncapture-resume` HttpOnly/Secure/SameSite=Strict cookie) →
`POST /api/public/capture/renew` (cookie-based renewal, single-flight, matching session ID) →
`GET /api/public/capture/sessions/{sessionId}` (display-safe manifest — case reference/registration/
vehicle label, shot definitions/progress, upload policy, status; excludes the internal case ID) →
`POST .../uploads` (bounded advisory `clientObservation` metadata, never trusted as acceptance
evidence; response is a 5-minute exact-object SAS, response-supplied headers only, no API bearer token
forwarded) → `POST .../uploads/{assetId}/complete` (`accepted`/`pending_review`, no evidence ID
exposed) → `POST .../submit` (idempotent, succeeds only once every required shot is accepted or
explicitly pending review; clears the resume cookie on success).

Error bodies are `{ "error": "<code>", "message": "<safe message>" }` — the client maps
missing/expired/revoked/locked/unsupported/validation/conflict/unauthorized/retryable conditions
without exposing URLs, tokens, registrations, filenames, or server exception text.

## Data protection (capture-specific)

See [Data protection](./data-protection.md) for the org-wide policy this flow must satisfy. Specific to
this flow:

- The 256-bit bootstrap secret lives only in the URL fragment, removed from browser history only after
  a successful exchange; short-lived access tokens stay in memory only.
- The resume secret stays outside JavaScript (HttpOnly/Secure/SameSite=Strict, host-only cookie); only
  its hash is stored server-side.
- IndexedDB drafts never hold bootstrap secrets, access tokens, resume secrets, SAS values, upload
  URLs, staff tokens, or provider credentials — only draft blobs, hashes, observations, idempotency
  keys, and resumable upload/asset IDs. A matching draft clears on authoritative acceptance/pending
  review; the whole session clears after successful submission.
- Client quality observations are bounded, untrusted review/evaluation metadata — never case IDs,
  filenames, image bytes, or acceptance evidence.
- Direct Blob upload sends only response-supplied headers, explicitly omitting API credentials and the
  bearer token, with no referrer.

## Threat model

**Risks:** a capture link forwarded to the wrong person; token brute force/replay; expired/revoked
links still accepting uploads; oversize uploads; MIME spoofing/non-image upload; duplicate uploads from
refresh/retry; a long-lived/reusable secret leaking via JS/logs/storage/third-party requests;
resume-cookie misuse or cross-site renewal; a SAS or bearer token reaching the wrong origin; personal
photos lingering in browser storage; forged client quality observations; photos landing on the wrong
case.

**Controls (both sides implemented):** high-entropy fragment-only bootstrap secret, stripped after
exchange; short-lived memory-only access tokens; HttpOnly/Secure/SameSite=Strict hashed-at-rest resume
cookie; same-origin credentials only where the protected cookie is actually needed; no secrets ever
persisted client-side; expiry/revocation checked every request; per-token/IP rate limiting (in-app
per-IP/per-session limiting landed 2026-07-16 — see TKT-200's `changes.md`); Blob requests carry only
response-supplied headers, no credentials, no referrer, no bearer token; server-side file-size/
magic-byte/MIME/decodeability/dimension/checksum/object-path-ownership/duplicate-status checks; stable
idempotency keys for upload creation and submission; reconciliation against the authoritative session
manifest; audit events for link and upload lifecycle.

## Verification and further reading

- [TKT-200-guided-capture-sessions](../tickets/now/TKT-200-guided-capture-sessions/) — server-side spec,
  changes, and verification status (schema/API/SPA deployed; public gates dark-by-default; physical-
  device camera proof, independent security review, and rollback rehearsal remain outstanding).
- [ADR-0007](../adr/0007-receipt-of-images.md) — image-receipt channel selection (still open) and this
  merge's amendment (repo consolidation ≠ channel selection).
- `infrastructure/config-capture/capture-spa.bicep` — the live `cespk-capture-spa-dev` Static Web App
  this browser client deploys to.
- `LIVE_FACTS.json`'s `safetyGates.publicCapture` entry and `docs/operations/feature-gates.md` — current
  live gate state; do not infer it from this document, which is architecture, not a live-state record.
