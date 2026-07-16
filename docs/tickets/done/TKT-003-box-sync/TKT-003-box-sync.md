---
id: TKT-003
title: Get .eml / images / instructions into the Box folder
status: done
priority: P1
area: box
tickets-it-relates-to: [TKT-004, TKT-010]
research-link: docs/tickets/done/TKT-003-box-sync/TKT-003-box-sync.md
---

# Get .eml / images / instructions into the Box folder

## Problem
The Box **folder** is being created at intake, but the **key files are not stored** — the source `.eml`,
the images, and the instruction documents are not making it into the folder.

## Evidence
Box is **LIVE** (JWT Server Auth) and the `BOX_*` gates are on — see the registry
[live-environment.md](../../../operations/live-environment.md). Box is an additive, one-way mirror (Postgres
is the system of record; evidence is linked, not embedded — ADR-0012). Folder-at-intake is wired
(`boxFolderCreateOrchestrator`); the gap is the **archive-copy of the evidence bytes** into the folder.

## Proposed change
Wire the upload/archive step so the Blob-backed `.eml`, instruction docs, and images are copied into the
case's Box folder after the folder is stamped, idempotently.

## Acceptance
For a freshly intaken case, the Box folder contains the `.eml`, the instruction document(s), and the
images; re-running does not duplicate.

## Research
- Operator stub: [box-sync.md](TKT-003-box-sync.md)
- Research pack: [research/box-sync.md](TKT-003-box-sync.md)
- Current operating context: [Archive operations](../../../operations/archive.md).

## Artifacts
- [Changes made](./changes.md)
- [2026-07-01 regression fix + junk-image co-discovery](./changes-regression-01-07-26.md)
- [Verification](./verification.md)
