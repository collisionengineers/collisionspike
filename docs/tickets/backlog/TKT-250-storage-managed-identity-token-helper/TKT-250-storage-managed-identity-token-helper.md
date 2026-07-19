---
id: TKT-250
title: Consolidate the storage managed-identity token helper
status: backlog
priority: P2
area: platform
tickets-it-relates-to: [TKT-210, TKT-247, TKT-248, TKT-251]
research-link: docs/tickets/backlog/TKT-250-storage-managed-identity-token-helper/evidence/distillation-note.md
plan: PLAN-007
---

# Consolidate the storage managed-identity token helper

## Problem
The storage-audience managed-identity token acquisition is hand-rolled at three sites, each producing an
`AccessToken`-shaped value for blob or queue access. This is a third copy of the same mint mechanism (finding
G), specialised to the storage audience.

## Evidence
Three storage-audience token acquisitions verified read-only on 2026-07-19: `platform/blob.ts`
`storageMiToken()`, `features/evidence/blob-store.ts` `storageMiToken()`, and
`features/inbound/outlook-queue.ts` `getStorageToken()` (all `resource=https://storage.azure.com`). The
originally-claimed duplicated SAS builder does **not** exist: there is exactly one SAS builder,
`blob-store.ts` `createCaptureUploadSas()` (user-delegation SAS with an Azurite loopback fallback). SAS is
therefore not a de-duplication target.

## Proposed change
Provide the storage-audience token through the shared `getManagedIdentityToken` primitive (built in TKT-248) via
a thin `storageManagedIdentityToken()` wrapper exposing the `TokenCredential`/`AccessToken` shape the storage
SDK expects, and migrate the three sites to it. These are the same three storage-audience sites counted in the
nine mint copies; TKT-248 migrates only the six bearer-token sites, so no site is migrated twice.

Preserve the storage mint's error contract: `platform/blob.ts:37-42` attaches `statusCode` and
`code: 'ManagedIdentityTokenError'` (and the `MSI storage token <status>` message) on a 429/5xx mint failure,
and `workflows/evidence/evidence-backfill.ts` `isRetryableStorageInfrastructureError` matches that shape to
redeliver transient managed-identity/metadata outages rather than fail terminally — the wrapper must keep
producing it. Preserve the Azurite loopback fallback.

**Keep the single capture SAS builder feature-owned.** `createCaptureUploadSas()` stays in
`services/data-api/src/features/evidence/blob-store.ts` and is **not** moved into the shared package: the
reconciled review classifies it as a security policy (exact-object create/write-only permissions,
HTTPS/loopback behaviour, five-minute expiry), not a reusable server-runtime mechanism. Share only
credential/client construction, not the SAS policy.

Note one genuine per-site difference to carry deliberately (or normalise consistently): two sites request the
resource as `https://storage.azure.com/` (trailing slash) and one without it.

## Acceptance
- **A1.** The three storage-audience token sites import the shared helper and contain no local storage-token
  mint; the `TokenCredential`/`AccessToken` shape the storage SDK consumes is preserved.
- **A2.** The storage mint's retryable-error contract is preserved: a 429/5xx mint failure still carries
  `statusCode` + `code: 'ManagedIdentityTokenError'` and the `MSI storage token <status>` message, and
  `evidence-backfill.ts` `isRetryableStorageInfrastructureError` still classifies it as retryable, proven by a
  test.
- **A3.** `createCaptureUploadSas()` stays feature-owned in `features/evidence/blob-store.ts` (not relocated
  into the shared package); its user-delegation-SAS behaviour and Azurite loopback fallback are unchanged and
  unit-tested, and it consumes only the shared credential/client construction.
- **A4.** Blob and queue operations behave identically (contract snapshot unchanged); both services build.
- **A5.** The net file/LOC delta for this ticket is negative (three storage mints removed for one thin wrapper).
- **A6.** No live deployment or cloud write.

## Validation
- Run blob-store and outlook-queue unit tests including the SAS path and the storage-token error-contract test;
  compare contract snapshots; report the file/LOC delta; full `node verify-all.mjs` green.

## Research
Distilled from `01-server-runtime-foundation.md` (finding G), split on 2026-07-19 verification into token
(three sites, a de-dup target) versus SAS (single site, feature-owned) — the SAS-duplication claim was
refuted (see the [distillation note](./evidence/distillation-note.md)). The reconciled review
(`workingspace/architecture-simplification/review_reconciled.md`) explicitly keeps the capture user-delegation
SAS feature-owned. Microsoft Learn recommends user-delegation SAS under managed identity, matching the
existing builder.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Distillation note](./evidence/distillation-note.md)
