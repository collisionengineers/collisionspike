# TKT-055 — verification

> `done` means **live and proven**. This ticket is **built + offline-tested**, NOT yet
> deployed and NOT yet applied to the live DB — the orchestrator applies the delta + deploys.

## Proven offline (this session)

- **api unit tests** — `npx vitest run` in `api/`: **141/141 pass**, including the two new
  files:
  - `src/lib/api-key-auth.test.ts` — hash determinism, mint shape, shape pre-filter, and the
    `withApiKey` flow (valid match → context + `last_used` stamp; missing/malformed → 401 with
    no DB hit; revoked → 401; prefix-collision disambiguated by the constant-time hash compare;
    unknown → 401).
  - `src/lib/provider-intake-validate.test.ts` — a valid submission normalises (VRM upper/strip,
    free-text clip, enum defaults); every DB-CHECK-mirroring rule rejects with the right code.
- **api build** — `npm --prefix api run build` (`tsc -b`) clean, including the refactored
  `cases.ts` / `internal.ts` mint call sites (removed unused imports).
- **domain** — `tsc -b` + `vitest` **762/762 pass** (new DTO module is types-only + exported).
- **SPA** — `tsc --noEmit` clean for the changed files (`Admin.tsx`, `rest-client.ts`); the only
  errors are pre-existing + unrelated (`DateField.tsx` missing `@fluentui/react-datepicker-compat`).
  `rest-client.test.ts` 32/32 pass.

## Not yet done — needs the orchestrator / operator

1. **Apply the delta** `migration/assets/schema/deltas/2026-07-03-provider-api-intake.sql`
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

**PENDING.** Routes still live and fail-closed, re-proven fresh: all four functions in the live 96-fn list + the deployed bundle; `POST /api/provider-intake/cases` → **401** no-key AND **401** malformed-key (this sweep's probes, matching the 07-03 smoke). No key mint recorded anywhere (BOARD/gated.md/LIVE_FACTS all say 0 rows). Remaining, operator-bound: (1) Superuser mints the first key in Admin; (2) E2E submit → `201 {caseId, casePo}`, case in review, evidence in Blob. Queued SQL certifies key-table emptiness (probes can't distinguish "no keys" from "unused keys"): `provider_api_key` counts + key-lifecycle audits + `intake_channel_kind_code=100000002` case count. Verified by: ticket-verifier dispatch, 2026-07-10.

### W7 data-pass result (orchestrator-run, 2026-07-10)
Key-table emptiness CERTIFIED: `provider_api_key` **0 keys / 0 active**, 0 key-lifecycle audits
(100000042–45), 0 `provider_api`-channel cases. The channel has never been used; the operator mint +
E2E submit remain the only path to close.
