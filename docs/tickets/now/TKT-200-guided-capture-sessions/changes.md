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

Offline evidence: `@cs/api` 1019 tests green (incl. new `capture-rate-limit.test.ts`, rate-limit
wiring, decode-saturation, HS384-refusal, animated-image and schema-parity suites); `@cs/domain`
559 green; `contract:capture:check` green; `check:runtime-contract` green (65 tables). A full offline
client↔server boundary round trip (local Postgres 16 + Azurite + `func start` from the deploy bundle)
passed 56/56 checks, including zero-duplicate submit replay (the named promotion gate), the 429
rate-limit path, animated-image and hash-mismatch rejections, and a real-Chromium PWA flow.

### Post-review fix (adversarial multi-lens review, verified against the running local stack)

- **Rate-limit caller key was spoofable (fixed).** `captureCallerKey` keyed on the client-controllable
  LEFTMOST `X-Forwarded-For` hop — a full caller-layer bypass (rotate the header ⇒ a fresh bucket every
  request) plus a chosen-victim lockout (send the victim's IP ⇒ share their pre-auth budget). Now
  prefers the platform-set `X-Azure-SocketIP`, else the hop the trusted layer appended (from the right,
  `CAPTURE_TRUSTED_PROXY_HOPS`, default 1 = direct-to-Functions), never the leftmost. Empirically
  confirmed on the local host: a rotating forged leftmost XFF now shares the appended-hop bucket and
  trips the cap at 10; distinct real callers keep independent budgets; `X-Azure-SocketIP` wins.
  **Operator note:** confirm `CAPTURE_TRUSTED_PROXY_HOPS` for the actual go-live ingress (direct
  Functions = 1; behind SWA-linked / Front Door = 2) before enabling `PUBLIC_CAPTURE_ENABLED`.
- **Rate-limit window purge decoupled from the retention gate.** `capture_rate_limit` is populated by
  public capture (`PUBLIC_CAPTURE_ENABLED`) independent of `CAPTURE_CLEANUP_ENABLED`, so the stale-window
  purge now runs on every timer tick rather than only when retention cleanup is on.
- Added committed coverage of the UPSERT admission-guard WHERE clause and the socket-IP /
  spoofed-leftmost / trusted-hop-depth caller-key cases.

### 2026-07-18 — PR #107 review round (Codex triage + main merge)

Triaged the two automated review findings on PR #107 and merged `origin/main` into the branch (the
three generated governance/contract ledgers reconverged; no functional conflicts).

- **PII-safe caller-key debug trace (Codex P2 — fixed).** `logCallerKeyDerivation`
  (`services/data-api/src/features/cases/capture-rate-limit.ts`) previously emitted the raw
  `X-Azure-ClientIP`, `X-Azure-SocketIP`, the full `X-Forwarded-For` chain, and the resolved key
  (all personal data / request-controlled) whenever `CAPTURE_CALLER_KEY_DEBUG=true` — the exact flag
  the go-live diagnostic asks operators to enable, in direct conflict with the ticket's PII-safe
  telemetry / no-secret-logging acceptance criterion. Rewritten to log only non-personal signals:
  the `X-Azure-FDID` value (the Front Door instance id to copy into `CAPTURE_SWA_FDID` — not personal
  data), whether it already matches the configured id, presence booleans for the client/socket IPs,
  whether Front Door resolved a client distinct from the proxy peer, the `X-Forwarded-For` hop count,
  and which source (`forwarded-client` / `socket-peer` / `trusted-xff-hop` / `unknown`) the key came
  from. Same diagnostic value for verifying the header contract, zero raw IPs. Off-by-default and
  still marked TEMPORARY — drop once the FDID is verified.
- **Front-Door trust needs platform ingress lockdown (Codex P1 — operational go-live gate, not a
  code change).** An in-app `X-Azure-FDID` match cannot by itself prove a request transited Front
  Door: the Front Door id is not a secret, and if the Function's direct `*.azurewebsites.net`
  endpoint stays reachable, a caller can forge `X-Azure-FDID` alongside a rotating `X-Azure-ClientIP`
  and evade the per-caller throttle. The code is safe as shipped — it fails closed to the socket peer
  until `CAPTURE_SWA_FDID` is set — but there is no correct code-only fix (the app cannot
  cryptographically attest Front Door transit; direct staff access is a supported path). **Go-live
  prerequisite (before setting `CAPTURE_SWA_FDID`):** restrict the Function App's ingress at the
  platform to accept traffic only from your Front Door — App Service access restrictions with the
  `AzureFrontDoor.Backend` service tag **and** an `x-azure-fdid=<your Front Door id>` header match
  (or Private Link). The service tag alone is insufficient (all Front Door tenants share it) and the
  header alone is insufficient (forgeable on a direct hit); both are required together. Ref:
  https://learn.microsoft.com/azure/frontdoor/origin-security#public-ip-address-based-origins and
  https://learn.microsoft.com/azure/app-service/app-service-ip-restrictions#access-restriction-advanced-scenarios
- **Source-size ratchet raised to the real counts.** `scripts/checks/source-size-budget.json` bumped
  to `capture.ts` = 1689 and `capture.test.ts` = 1993 (the committed branch bump undershot the actual
  nonblank line counts, failing `check:source-size`). Also fixed a comment-only key-shape nit in the
  rate-limit module header (`{scope}:{id}`, not `session:{scope}:{id}`).
