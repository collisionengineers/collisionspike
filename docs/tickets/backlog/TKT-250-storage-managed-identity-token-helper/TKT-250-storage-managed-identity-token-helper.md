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
Provide the storage-audience token through the shared `getManagedIdentityToken` (a thin
`storageManagedIdentityToken()` wrapper exposing the `TokenCredential`/`AccessToken` shape the storage SDK
expects) and migrate the three sites to it. Move the single SAS builder alongside the storage helper
unchanged — it is co-located for ownership, not de-duplicated. Preserve the Azurite loopback fallback. Note
one genuine per-site difference to carry deliberately (or normalise consistently): two sites request the
resource as `https://storage.azure.com/` (trailing slash) and one without it.

## Acceptance
- **A1.** The three storage-audience token sites import the shared helper and contain no local storage-token
  mint; the `TokenCredential`/`AccessToken` shape the storage SDK consumes is preserved.
- **A2.** The single `createCaptureUploadSas()` builder is relocated with the storage helper unchanged, with
  its user-delegation-SAS behaviour and Azurite loopback fallback preserved and unit-tested.
- **A3.** Blob and queue operations behave identically (contract snapshot unchanged); both services build.
- **A4.** The net file/LOC delta for this ticket is negative.
- **A5.** No live deployment or cloud write.

## Validation
- Run blob-store and outlook-queue unit tests including the SAS path; compare contract snapshots; report the
  file/LOC delta; full `node verify-all.mjs` green.

## Research
Distilled from `01-server-runtime-foundation.md` (finding G), split on 2026-07-19 verification into
token (three sites) versus SAS (single site) — the SAS-duplication claim was refuted (`PLAN-007.dossier`).
Microsoft Learn recommends user-delegation SAS under managed identity, matching the existing builder.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)
