# Changes — TKT-200: Add secure guided photo capture sessions

## Status

The PR #83 implementation was merged into the PR #100 reconciliation and deployed on 2026-07-16. Its
schema, staff/API routes and SPA are present, but public capture and cleanup remain default-off pending
abuse-control, designated-test-session and physical-device evidence. No Archive write or live public
cutover was used as deployment proof.

TKT-200 replaces the conflicting provisional TKT-171 number. TKT-171 belongs exclusively to the
four-digit Case/PO sequence ticket in the contiguous TKT-171–199 operator drop.

## 2026-07-16 — offline hardening follow-ups implemented (branch `capture-server`)

Every code follow-up from the 2026-07-15 offline review is now implemented; the feature stays dark.

- **Public-ingress rate limiting (primary go-live gap):** new `capture_rate_limit` table
  (`database/baseline/197_capture_rate_limit.sql` + replay-safe delta
  `database/migrations/2026-07-16-capture-rate-limit.sql`, RLS block in `900_constraints.sql`) with the
  MCP-style single-UPSERT per-minute window in
  `services/data-api/src/features/cases/capture-rate-limit.ts`. Two layers on every public route:
  per-caller `ip:{first x-forwarded-for hop}` before any other work, and per-session budgets
  (`manifest|uploads|complete|submit:{sessionId}`) only after bearer verification so an attacker cannot
  burn a victim session's budget without a valid token. Over-budget ⇒ `429 capture_retryable` +
  `Retry-After: 60`. Caps env-tunable (`CAPTURE_RATE_LIMIT_*_PER_MINUTE`, clamped 1..600; defaults
  ip 120, exchange 10, renew 30, manifest 60, uploads 40, complete 40, submit 12). Stale windows are
  purged by the cleanup timer. Contract revision (additive, server-first): `contracts/capture.v1.yaml`
  declares `429` + `Retry-After` on all six public routes; types regenerated; runtime-contract snapshot
  regenerated (new table).
- **Decode-path concurrency cap:** the complete route's download+decode segment now takes a
  process-local slot (`CAPTURE_DECODE_CONCURRENCY`, default 4, clamp 1..16); saturation releases the
  validation lease (`decode_capacity_retryable`) and returns `503 capture_retryable`.
- **Animated-image rejection:** explicit single-frame assertion in
  `features/evidence/upload-validate.ts` (`animatedImage`): APNG `acTL` scan + WebP VP8X animation
  flag / `ANIM`/`ANMF` chunk scan, refused before any decoder runs.
- **HS256 pinning:** `verifyCaptureAccessToken` passes `algorithms: ['HS256']`.
- **Gates registry:** the four capture kill-switches are now central accessors in
  `packages/domain/src/gates.ts` (`captureSessions`, `publicCapture`, `captureDirectUpload`,
  `captureCleanup`); `capture.ts`/`capture-cleanup.ts` read them via `features/settings/gates.ts`.
  Semantics unchanged (default-off, independent, literal `'true'`).
- **Capture evidence identity CHECK:** `ck_evidence_capture_source_message` guarantees a non-null
  `public-capture:{assetId}` `source_message_id` wherever `source_label = 'public_guided_capture'`
  (the partial dedup index no-ops on NULL) — baseline 196 + the 2026-07-16 delta.
- **`humanActorName` regression:** pinned that legitimate hyphenated hex-alphabet names still render
  (`shared/last-activity.test.ts`).
- **Loopback-only local verification seam:** capture blob helpers resolve through
  `captureBlobBackend()` — managed identity always wins when present; a double-opt-in fallback
  (`CAPTURE_LOCAL_DEV_BLOB=true` AND `EVIDENCE_BLOB_CONNECTION` with a loopback endpoint) signs
  shared-key exact-object `cw` SAS against Azurite for offline end-to-end proof; every non-loopback
  endpoint is refused. Source-pinned in `capture-blob-security.test.ts`.

Offline evidence: `@cs/api` 1011 tests green (incl. new `capture-rate-limit.test.ts`, rate-limit
wiring, decode-saturation, HS384-refusal, animated-image and schema-parity suites); `@cs/domain`
559 green; `contract:capture:check` green; `check:runtime-contract` green (65 tables).
