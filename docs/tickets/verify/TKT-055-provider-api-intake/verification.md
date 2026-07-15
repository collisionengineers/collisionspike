# TKT-055 — verification

> `done` means **live and proven**. The original provider intake channel is deployed, but this ticket
> remains `verify`: no legitimate provider key/submission lifecycle is live-proven, and the 2026-07-15
> idempotency migration and code require the deployment proof recorded below before they are claimed live.

## 2026-07-15 final-review evidence

- The complete domain, Data API, orchestration and web suites passed before final deployment.
- Focused tests prove strict Base64 rejection before writes, provider-scoped content binding, exact
  replay, different-content conflict, and durable completion state.
- The publishable contract now requires `Idempotency-Key` and documents `409` conflict and retryable
  `503` incomplete-evidence behavior.
- Live application of `2026-07-15-provider-intake-idempotency.sql`, deployment and read-only route/schema
  confirmation are still pending at this point in the review. No legitimate provider key is minted and
  no fabricated provider case is used merely to close verification.

## Proven offline (this session)

- **api unit tests** — `npx vitest run` in `services/data-api/`: **141/141 pass**, including the two new
  files:
  - `src/platform/auth/api-key-auth.test.ts` — hash determinism, mint shape, shape pre-filter, and the
    `withApiKey` flow (valid match → context + `last_used` stamp; missing/malformed → 401 with
    no DB hit; revoked → 401; prefix-collision disambiguated by the constant-time hash compare;
    unknown → 401).
  - `src/features/providers/intake-validate.test.ts` — a valid submission normalises (VRM upper/strip,
    free-text clip, enum defaults); every DB-CHECK-mirroring rule rejects with the right code.
- **api build** — `npm --prefix services/data-api run build` (`tsc -b`) clean, including the refactored
  `cases.ts` / `internal.ts` mint call sites (removed unused imports).
- **domain** — `tsc -b` + `vitest` **762/762 pass** (new DTO module is types-only + exported).
- **SPA** — `tsc --noEmit` clean for the changed files (`Admin.tsx`, `rest-client.ts`); the only
  errors are pre-existing + unrelated (`DateField.tsx` missing `@fluentui/react-datepicker-continuity`).
  `rest-client.test.ts` 32/32 pass.

## Not yet done — needs the orchestrator / operator

1. **Apply the delta** `database/migrations/2026-07-03-provider-api-intake.sql`
   (BEFORE the api deploy — the routes reference the new table + choice rows). Runbook in the
   delta header (transient firewall rule → AAD token → `SET ROLE csadmin` → `\i` → drop rule).
2. **Deploy** the api Function App (`cespk-api-dev`) with the new routes.
3. **Superuser** mints the first key in Admin (`POST /api/providers/{id}/api-keys`) and does an
   end-to-end `POST /api/provider-intake/cases` smoke test → expect `201 { caseId, casePo }`,
   the case visible in review, evidence in Blob.
4. **Live-number registry** — no new live counts to record until a key is minted / a case lands
   (all live facts stay in `LIVE_FACTS.json` / live-environment.md, never here).

## Not built (v1 scope boundary — see ADR-0020)
Per-key rate limiting, a `multipart/form-data` transport, and a provider "test my key" ping.

## 2026-07-03 — live deploy verification (agent)

- DDL delta `2026-07-03-provider-api-intake.sql` **APPLIED live** (Entra `digital@` → `SET ROLE csadmin`): `to_regclass` → table present; RLS `t|t`; policies `p_provider_api_key_rw` + `p_provider_api_key_no_delete`; audit codes 100000042–45; `choice_intake_channel_kind` 100000002. Transient firewall rule added + removed.
- `cespk-api-dev` deployed — **77 functions** incl. `createProviderApiKey` / `listProviderApiKeys` / `revokeProviderApiKey` / `providerIntakeCase`.
- api MI granted **Storage Blob Data Contributor** on `cespkevidstdev01` (ARM PUT `defece45-0475-4ba1-bbf5-7d0216672291`); `EVIDENCE_BLOB_ACCOUNT`/`EVIDENCE_BLOB_CONTAINER` set.
- Auth smoke: `POST /api/provider-intake/cases` with **no key → 401**, **bad key → 401** (fail-closed).
- SPA Admin "API keys" panel confirmed rendering in the provider editor (Superuser-gated message shown to non-superuser session).
- **Pending (operator):** mint the first key as Superuser, then an end-to-end `POST /api/provider-intake/cases` submit with real Base64 payload per `docs/reference/provider-api-intake-spec.md`.

## Verdict update — 2026-07-10 (final sweep, ticket-verifier dispatch; transcribed verbatim)

**PENDING.** Routes still live and fail-closed, re-proven fresh: all four functions in the live 96-fn list + the deployed bundle; `POST /api/provider-intake/cases` → **401** no-key AND **401** malformed-key (this sweep's probes, matching the 07-03 smoke). No key mint recorded anywhere (BOARD/ticket board/LIVE_FACTS all say 0 rows). Remaining, operator-bound: (1) Superuser mints the first key in Admin; (2) E2E submit → `201 {caseId, casePo}`, case in review, evidence in Blob. Queued SQL certifies key-table emptiness (probes can't distinguish "no keys" from "unused keys"): `provider_api_key` counts + key-lifecycle audits + `intake_channel_kind_code=100000002` case count. Verified by: ticket-verifier dispatch, 2026-07-10.

### W7 data-pass result (orchestrator-run, 2026-07-10)
Key-table emptiness CERTIFIED: `provider_api_key` **0 keys / 0 active**, 0 key-lifecycle audits
(100000042–45), 0 `provider_api`-channel cases. The channel has never been used; the operator mint +
E2E submit remain the only path to close.

## Verdict update — 2026-07-14 (independent PLAN-005 sweep; transcribed verbatim)

## Verdict

PENDING

## Evidence

- Fresh live function inventory lists `providerIntakeCase`, `createProviderApiKey`,
  `listProviderApiKeys`, and `revokeProviderApiKey`.
- Since the 11 July rollout, App Insights records **zero requests** to all four functions.
- The wider 9–14 July query contains only two `providerIntakeCase` requests, both generic `401` responses
  on 10 July; there is no observed key mint/list/revoke or successful `201` intake.
- Targeted API authentication and submission-validation tests passed within the 51/51 API run. They cover
  SHA-256 hashing, key shape, constant-time matching, generic missing/malformed/unknown/revoked-key `401`s,
  key-derived provider resolution, valid submissions, and machine-readable validation failures.
- Current schema/source defines hash-plus-prefix storage, no plaintext column, `revoked_at` soft revocation,
  no application `DELETE` grant, Superuser-only management routes, server-resolved provider identity, the
  50 MB guard, shared Case/PO allocation, and Blob evidence upload.

## Pending / gaps

- No legitimate live key or valid-key `201` submission proves case creation, normal review state,
  key-derived provider/principal, or Blob evidence landing.
- No live Admin mint/list/revoke lifecycle proves plaintext-once behavior or soft revocation.
- Live `400` and `413` route responses are not demonstrated; only generic `401` is live-proven.
- No current database row proves hash-only persistence, prefix storage, `last_used_at`, or `revoked_at`.
- Direct Postgres verification was unavailable without changing the firewall; no firewall change was made.

## How to re-verify

During genuine provider onboarding, have a Superuser mint the first operational key, confirm plaintext-once
presentation, and list it without plaintext. Submit one legitimate provider case in the approved test
window and verify `201`, review state, key-derived identity, Blob evidence, hash-plus-prefix-only storage,
and audit rows. During a real rotation, revoke the key and verify generic `401` plus retained `revoked_at`;
also exercise representative `400` and `413` requests.

## Confidence + unread surfaces

High confidence that the routes and offline implementation are present; high confidence that live
acceptance remains unmet. Unread surfaces: current Postgres key/case/audit rows, Blob objects, signed-in
Admin behavior, and any sampled-out telemetry.
