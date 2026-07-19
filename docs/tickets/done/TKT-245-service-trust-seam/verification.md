# Verification — TKT-245: Decide and harden the internal service-trust seam (withServiceAuth)

## Verdict

TESTED (offline). Verified 2026-07-20 on branch `plan008/canonical-routes`. Behaviour-preserving; no live write.

## Evidence

- **Caller inventory + decision.** A repository call-site inventory (14 route files, ~40 `withServiceAuth`
  sites) plus the PLAN-009 read-only live identity check name the two legitimate managed-identity callers:
  the **orchestration** app (`adapters/archive-mirror-api.ts`, on `@cs/server-runtime`) and the **Archive /
  box-webhook Function** (`services/functions/box-webhook/data_api_client.py`, system-assigned MI for the
  `DATA_API_AUDIENCE`). The trust model is **decided and documented** (affirm audience-only) in the shared
  seam's docblock and in the ADR-0029 amendment.
- **One implementation remains.** The divergent `mirror-outbox-routes.ts` copy is removed; a repo-wide
  search finds exactly one `withServiceAuth` (in `service-support.ts`). The three mirror routes now use it.
- **Error semantics preserved (verified case-by-case).** Missing/invalid/expired token → 401 `{error:<msg>}`
  no log; unexpected auth failure (non-JOSE rethrow) → `ctx.error` + 500 `{error:'internal'}`; handler throws
  a non-HttpError → `ctx.error` + 500 `{error:'internal'}`. Identical between the removed copy and the shared
  seam for the current handler set (the copy's only theoretical divergence — a handler throwing an
  `HttpError` — is unreachable: the three mirror handlers return status objects and never `throw new HttpError`).
- **No behaviour change.** `npm run check:runtime-contract` PASS; data-api + orchestration build; the mirror /
  provider / file-request outbox route tests pass (data-api targeted suites 29/29). Net −16 source lines.

## Pending / gaps

- Hardening the seam (principal allowlist / dedicated app-role) is intentionally **not** done here — it is
  operator-gated live-admission work, tracked against the ADR-0029 amendment.

## How to re-verify

`grep -rn "async function withServiceAuth\|export async function withServiceAuth" services/` returns exactly
one definition; `npm run check:runtime-contract` PASS; `npx vitest run mirror-outbox provider-outbox` pass;
confirm the ADR-0029 amendment is dated and resolves.
