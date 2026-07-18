---
name: capture-hardening-2026-07-16
description: "2026-07-16 capture completion work — worktree branches capture-server (spike) + capture-build (client), TKT-200 hardening done, contract pinned, full offline+browser boundary proof; deploy awaiting user greenlight"
metadata: 
  node_type: memory
  type: project
  originSessionId: e3ce1bd6-d89c-45fa-86d8-6ccdcaa28af8
---

Work landed 2026-07-16 in sibling worktrees under `C:/Users/Alex/Documents/GitHub/collisionsuite-worktrees/` (NOT pushed — user greenlight required; deploy order server-first):

- **collisionspike branch `capture-server`** (bf9e7c4b + 4af8878b + bb81e524): every TKT-200 offline-review follow-up — durable per-IP/per-session rate limiting (`capture-rate-limit.ts`, `capture_rate_limit` table, 429/Retry-After added to contracts/capture.v1.yaml), decode-concurrency slots, explicit APNG/animated-WebP rejection, HS256 pin, capture gates in the central registry, evidence `source_message_id` CHECK, loopback-only `CAPTURE_LOCAL_DEV_BLOB` Azurite backend, and a 416-tolerant bounded staging download. 1016 api tests + all repo checks green; source-size ratchets bumped (capture.ts 1653, capture.test.ts 1956).
- **collisioncapture branch `capture-build`** (rebased on origin/main 16cb214, + 1b879d5): canonical spec vendored byte-identical, source-lock pinned to spike commit 4af8878b with sourcePath `contracts/capture.v1.yaml` (checker updated), vite `/api`→7071 dev proxy, CaptureApp test time-bomb fixed (fixtures hard-coded accessTokenExpiresAt 2026-07-14 — expired and rerouted getManifest through renewal). verify 54+107 green, e2e 8/8.
- **Local boundary proof (no Azure)**: embedded-postgres 17 via pg_ctl (postgres.exe refuses elevated tokens) + Azurite (`--skipApiVersionCheck`; set blob CORS for the vite origin; use `UseDevelopmentStorage=true`) + `func start` from the esbuild deploy bundle (`.artifacts/deploy/data-api` — raw dist ESM fails on an extensionless import in @cs/domain). 56/56 scripted checks incl. zero-duplicate submit replay (promotion gate) and rate-limit 429s, plus a real-Chromium PWA flow (harness: scratchpad/localstack of session e3ce1bd6).

**How to apply:** If the pinned spike commit gets squashed on merge, re-pin the client source-lock. Remaining before public go-live (per TKT-200): live schema diff, physical-device evidence (CCAP-016), deployed-stack round trip, SWA linked backend + blob CORS + PAYG (CCAP-014). See [[capture-server-exists-tkt200]].
