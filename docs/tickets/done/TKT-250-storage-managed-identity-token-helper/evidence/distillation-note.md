# Distillation note — TKT-250

**Source:** `01-server-runtime-foundation.md` finding G. **Plan:** PLAN-007. Re-verified read-only 2026-07-19;
this note is the committed verification record.

**Storage-audience MI token — three sites** (`resource=https://storage.azure.com`):
- `services/orchestration/src/platform/blob.ts` `storageMiToken()` — wraps as a `TokenCredential`.
- `services/data-api/src/features/evidence/blob-store.ts` `storageMiToken()` — twin of the above.
- `services/data-api/src/features/inbound/outlook-queue.ts` `getStorageToken()`.

**SAS builder — single site (claim of duplication REFUTED):** only
`services/data-api/src/features/evidence/blob-store.ts` `createCaptureUploadSas()` builds a SAS
(`getUserDelegationKey` + `generateBlobSASQueryParameters`, with a loopback-Azurite `StorageSharedKeyCredential`
fallback). Repo-wide grep for `generateBlobSASQueryParameters` / `getUserDelegationKey` / `BlobSASPermissions`
returns only this file and its test. So the original plan claim "storage MI-token + SAS helper (G, 2–3 copies)"
splits into token = 3x (a de-dup target) and SAS = 1x (feature-owned, not de-duplicated).

**SAS ownership (reconciled review):** `review_reconciled.md` classifies `createCaptureUploadSas()` as a
feature-owned security policy (exact-object create/write-only, HTTPS/loopback, five-minute expiry), not a
reusable server-runtime mechanism. It therefore stays in `features/evidence/blob-store.ts`; only
credential/client construction is shared. TKT-250 does not relocate it into the package.

**Storage-mint error contract to preserve:** `platform/blob.ts` attaches `statusCode` +
`code: 'ManagedIdentityTokenError'` on a 429/5xx mint failure; `evidence-backfill.ts`
`isRetryableStorageInfrastructureError` matches that shape (and the `MSI storage token <status>` message) to
redeliver transient outages. The storage wrapper must keep producing it.

**Migration split:** these three storage-audience sites are the subset of the nine mint copies owned here;
TKT-248 migrates the six bearer-token sites, so no site is migrated twice.

**Microsoft Learn:** user-delegation SAS (via `getUserDelegationKey`, RBAC
`generateUserDelegationKey` + a data-plane role) is the recommended approach under managed identity — the
existing builder already follows it; keep it.
