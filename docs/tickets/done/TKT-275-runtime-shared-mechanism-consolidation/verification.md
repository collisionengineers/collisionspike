# Verification — TKT-275: Consolidate residual runtime shared mechanisms

## Verdict

PASS

## Evidence

- **Byte-identity — `check:runtime-contract`.** `node scripts/checks/check-runtime-contract.mjs` →
  191 routes, 56 DTO declarations, 7 JSON schemas, 65 Postgres tables, 22 numeric code tables — identical
  to the pre-change baseline.
- **Digest byte-parity (persisted-key safety).** `packages/server-runtime/src/content-digest.test.ts`
  reproduces the three replaced serializers inline and asserts `requestDigest` matches them exactly over a
  battery of inputs (mixed-case keys, nested, arrays, null/undefined, unicode). `@cs/server-runtime`
  vitest: 51 passed.
- **Suites pass.** `@cs/domain` 598, `@cs/orchestration` 581, `@cs/api` 1102 — all green after the
  migration. Full `npm run build` succeeds (all workspaces incl. the SPA).
- **Boundary + guards.** `check:production-dependencies` PASS (1 browser-safe package audited — `@cs/domain`
  stays SDK-free with the new export); `check:managed-identity-mint`, `check:route-authority`,
  `check:auth-inventory`, `check:scripts-dedup`, `check:guard-register` all PASS.
- **One home each.** One `contentSha256` producer, one `SHA256_HEX_RE` validator (strict lower-case), one
  `requestDigest`, one `safeErrorText`. The `/i`-vs-strict and key-order splits are resolved and recorded;
  the three literal-order idempotency sites are deliberately not migrated.
- **Net LOC.** −28 lines in owned runtime `.ts` source (76 insertions / 104 deletions across 18 files),
  before the added regression test.
- **No live write.**

## Commands

```
npm run build
node scripts/checks/check-runtime-contract.mjs
npm run test --workspace @cs/server-runtime
npm run test --workspace @cs/domain
npm run test --workspace @cs/orchestration
npm run test --workspace @cs/api
node scripts/checks/check-production-dependencies.mjs
```

## Pending / gaps

None.
