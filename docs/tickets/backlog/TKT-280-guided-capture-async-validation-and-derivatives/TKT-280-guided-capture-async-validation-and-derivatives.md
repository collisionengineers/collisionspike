---
id: TKT-280
title: Guided capture — async validation worker, advisory OCR, and display derivatives
status: backlog
priority: P2
area: integration
tickets-it-relates-to: [TKT-278, TKT-200]
research-link: docs/tickets/backlog/TKT-280-guided-capture-async-validation-and-derivatives/evidence/scope.md
---

# Guided capture — async validation worker, advisory OCR, and display derivatives

## Problem

Renumbered from collisioncapture's `CCAP-011-async-validation-worker` during the TKT-278 repository
merge, narrowed to what TKT-200 did **not** already ship. Verified against the actual shipped code
(`services/data-api/src/features/cases/capture-cleanup.ts`, `capture-upload.ts`'s
`upload-validate.ts`):

- **Shipped**: retention cleanup (`capture-retention-cleanup` timer, deletes unmaterialised assets past
  a configurable window for expired/revoked/complete/locked sessions) and structural/decompression-bomb/
  animated-image guards (`sharp({ limitInputPixels })`, single-frame assertion) — both run **synchronously
  inline** in the upload-completion request.
- **Not shipped**: a dedicated async validation queue/worker (the pattern `evidence-backfill.ts` uses
  elsewhere in this repo), advisory OCR/plate-read hookup for capture assets, and generation of
  EXIF-stripped display/training derivatives.

## Evidence

- [Scope](./evidence/scope.md) — what's shipped vs. missing, with file references.

## Proposed change

Add an async validation worker (mirroring `evidence-backfill.ts`'s pattern) for capture assets that need
more than the synchronous structural checks already in place, wire advisory OCR/plate-read the way other
evidence-ingestion paths do, and generate EXIF-stripped display derivatives for staff/training use —
without duplicating the synchronous guards that already work.

## Acceptance

- An async worker exists for capture-asset post-processing, following this repo's established
  `evidence-backfill.ts`-style pattern rather than inventing a new one.
- Advisory OCR/plate-read runs for capture assets on the same terms as other evidence ingestion (never
  trusted as acceptance evidence, consistent with the client's own `clientObservation` discipline).
- Display derivatives (EXIF-stripped, normalized) are generated and stored per capture asset.
- The already-shipped synchronous guards (decompression-bomb, animated-image, retention cleanup) are
  left unchanged.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Scope](./evidence/scope.md)
