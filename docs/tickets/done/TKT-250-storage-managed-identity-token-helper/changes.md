# Changes — TKT-250: Consolidate the storage managed-identity token helper

## Status
verify — implemented on branch `plan007/server-runtime` (commit 6d5ed5a2).

## Files added / changed
- `packages/server-runtime/src/storage-credential.ts` (+ test); `src/managed-identity.ts`
  (`getManagedIdentityAccessToken` sibling; `getManagedIdentityToken` delegates)
- `services/orchestration/src/platform/blob.ts`; `services/data-api/src/features/evidence/blob-store.ts`;
  `services/data-api/src/features/inbound/outlook-queue.ts`
- `services/orchestration/src/workflows/evidence/storage-token-retry-contract.test.ts` (A2 round-trip)

## Summary
Three storage mints collapse onto one shared wrapper; the retryable-error contract is reproduced exactly so
`isRetryableStorageInfrastructureError` still classifies transient failures as retryable; the capture SAS stays
feature-owned. Net production LOC −6.
