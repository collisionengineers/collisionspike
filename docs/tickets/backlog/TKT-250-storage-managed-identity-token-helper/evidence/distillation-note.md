# Distillation note — TKT-250

**Source:** `01-server-runtime-foundation.md` finding G. **Plan:** PLAN-007. Re-verified read-only 2026-07-19
(`PLAN-007.dossier.json`).

**Storage-audience MI token — three sites** (`resource=https://storage.azure.com`):
- `services/orchestration/src/platform/blob.ts` `storageMiToken()` — wraps as a `TokenCredential`.
- `services/data-api/src/features/evidence/blob-store.ts` `storageMiToken()` — twin of the above.
- `services/data-api/src/features/inbound/outlook-queue.ts` `getStorageToken()`.

**SAS builder — single site (claim of duplication REFUTED):** only
`services/data-api/src/features/evidence/blob-store.ts` `createCaptureUploadSas()` builds a SAS
(`getUserDelegationKey` + `generateBlobSASQueryParameters`, with a loopback-Azurite `StorageSharedKeyCredential`
fallback). Repo-wide grep for `generateBlobSASQueryParameters` / `getUserDelegationKey` / `BlobSASPermissions`
returns only this file and its test. So the original plan claim "storage MI-token + SAS helper (G, 2–3 copies)"
splits into token = 3x (a de-dup target) and SAS = 1x (co-located, not de-duplicated).

**Microsoft Learn:** user-delegation SAS (via `getUserDelegationKey`, RBAC
`generateUserDelegationKey` + a data-plane role) is the recommended approach under managed identity — the
existing builder already follows it; keep it.
