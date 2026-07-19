# Verification — TKT-250: Consolidate the storage managed-identity token helper

## Verdict
TESTED (offline).

## Evidence
- The three storage-audience mints (`platform/blob.ts`, `evidence/blob-store.ts`, `inbound/outlook-queue.ts`)
  migrate onto `storageManagedIdentityToken()` / `storageManagedIdentityCredential()` in `@cs/server-runtime`
  (the `TokenCredential`/`AccessToken` shape, structurally typed so no `@azure/core-auth` dependency enters the
  package — ADR-0031 preserved) around `getManagedIdentityAccessToken`; the local mints are deleted (A1).
- A2 error contract preserved: on a 429/5xx mint failure the wrapper throws
  `Object.assign(new Error(\`MSI storage token ${status}\`), { statusCode, code: 'ManagedIdentityTokenError' })`
  — the exact shape `evidence-backfill.ts` `isRetryableStorageInfrastructureError` matches; proven by a
  round-trip test importing the REAL predicate (429/500/503 retryable including as a nested `cause`; 403
  terminal).
- A3: `createCaptureUploadSas()` + the Azurite loopback fallback stay feature-owned in `blob-store.ts`
  (unchanged); only credential/client construction is shared. The trailing-slash audience difference is carried
  deliberately (two blob sites `…azure.com/`, the queue bare) as distinct cache keys.
- Verified: server-runtime 36 tests; api 1102; orchestration 578; `check:runtime-contract` unchanged (191
  routes, A4); production-dependency boundary holds. Net production LOC −6 (A5).

## Pending / gaps
- None.

## How to re-verify
`npm test --workspace @cs/server-runtime && npm run test --workspace @cs/api && npm run test --workspace @cs/orchestration && npm run check:runtime-contract`.
