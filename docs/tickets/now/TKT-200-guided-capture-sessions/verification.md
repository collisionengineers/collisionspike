# Verification — TKT-200: Add secure guided photo capture sessions

## Verdict

PENDING — PR #83 was rebased onto post-#73 `main`, merged 2026-07-15, and its schema, API and SPA were
deployed on 2026-07-16 with public capture and cleanup default-off. A four-lane offline review (security, DB/schema,
integration, docs) found **no BLOCKER and no code must-fix**: the security-critical design was verified
solid (256-bit hashed secrets, `__Host-` HttpOnly cookie, 15-min generation-revocable JWTs, MI-only
create/write exact-object SAS, TOCTOU-safe raster-only capped-before-decode validation, content-addressed
browser-inaccessible promotion, RLS FORCE + admin-only-DELETE, SSRF-safe, no secret logging). Offline
suites pass on the merged head. This does not establish live schema, public ingress, managed-identity
upload, physical camera behaviour or canonical evidence materialisation.

## Required evidence

- Exact-head OpenAPI/generation drift, API, schema, domain, SPA and browser suites.
- Independent security review of staff/public authority, secret/cookie lifecycle, exact-object upload,
  validation, idempotency/concurrency, merge lineage, retention and PII-safe telemetry.
- Backup-first schema/config rollout plus rollback rehearsal with every public gate default-off.
- Signed-in staff workflow and one approved end-to-end session under the Archive test root.
- Physical Safari/iPhone and Chrome/Android camera permission, fallback, retake, retry and recovery proof.
- Database/storage/Evidence/audit/readiness/Archive reconciliation and negative tamper/replay/old-link
  probes before independent ticket verification.

## Offline hardening follow-ups — IMPLEMENTED 2026-07-16 on branch `capture-server` (see changes.md)

All items below now have code + offline tests on the `capture-server` branch: in-app per-IP/per-session
rate limiting with a contract 429, decode-concurrency cap, animated-image rejection, HS256 pinning,
central gate registration, the capture-evidence `source_message_id` CHECK, and the `humanActorName`
regression. Live schema diff, physical-device acceptance and end-to-end LIVE proof remain outstanding;
an OFFLINE full-boundary round trip (local Postgres 16 + Azurite + `func start`) is recorded in the
collisioncapture programme evidence.

## Original follow-up list (from the 2026-07-15 review — non-blocking, ship dark)

- **Public-ingress abuse control (primary go-live gap):** the six anonymous public routes have NO in-app
  rate-limit / origin allowlist / CORS — abuse control is only the per-session DB reservation ceilings,
  which lock the session but never throttle by caller/IP. Provide a per-IP token-bucket (Front Door/APIM
  or in-app) and cap decode-path concurrency before enabling `PUBLIC_CAPTURE_ENABLED`.
- Reject animated images on the public upload path (assert single-frame) so a multi-frame WebP can't
  amplify the decode allocation.
- Pin `algorithms: ['HS256']` in `verifyCaptureAccessToken` (defense-in-depth; jose already infers HS
  from the symmetric key, so not exploitable today).
- Register the four capture kill-switches in the central `packages/domain/src/gates.ts` registry for
  discoverability/consistency (semantics are already correct: default-off, independent, literal `'true'`).
- Guarantee a non-null, case-embedding `source_message_id` for capture Evidence (the partial dedup index
  `uq_evidence_capture_asset` no-ops on NULL), or add a table CHECK.
- Scope the `last-activity.ts` `humanActorName` GUID-anywhere broadening to capture actors, or add a
  regression asserting a legitimate name containing hex-with-dashes still renders.
- Diff the live `capture_*` tables against a fresh rebuild from `196_capture_session.sql` before enabling
  (the delta's `CREATE TABLE IF NOT EXISTS` no-ops on the drifted live tables, so offline can't fully
  prove rebuild==live).

## Pending / gaps

The schema and deployables are live, but no public gate, Archive content or live case was changed — the
feature is dark. End-to-end session proof under the Archive test root, physical-device camera proof,
security review, rollback rehearsal and safe abuse control remain outstanding before this ticket can leave
`now`.

## 2026-07-20 — staff SPA panel wiring gap found and fixed (offline only; distinct from the public-ingress gap)

A TKT-159 follow-up audit found `GuidedPhotoRequestPanel` (the staff control for issuing/managing a
case's capture link) was never rendered by any screen — see `changes.md` for the root cause (same
mockup-app→apps/web port failure as TKT-160). Fixed by rendering it in the case-detail Chasers tab and
threading its result into `ChaserPanel`'s existing `guidedPhotoLink` prop. `tsc --noEmit` clean, full
`apps/web` suite 556/556 passing, production build succeeds. This is unrelated to, and does not change,
the separate live `PUBLIC_CAPTURE_ENABLED`/Front-Door-ingress gap recorded in `changes.md`'s 2026-07-20
entry above — that remains open, live, and explicitly left exposed by operator decision. Verdict stays
`PENDING`.
