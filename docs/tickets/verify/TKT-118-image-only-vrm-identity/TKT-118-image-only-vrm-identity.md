---
id: TKT-118
title: Rename the "Image Based" case label + identify image-only cases by VRM (no Case/PO before instructions)
status: verify
priority: P2
area: intake
tickets-it-relates-to: [TKT-024, TKT-034, TKT-084]
research-link: docs/tickets/verify/TKT-118-image-only-vrm-identity/evidence/operator-note.md
plan: PLAN-003
---
# TKT-118 — Rename the "Image Based" case label + identify image-only cases by VRM (no Case/PO before instructions)

## Problem

New cases created from images-without-instructions are labelled "Image Based", which staff can confuse with "Image Based Assessment" (an inspection method). These cases also cannot carry a Case/PO yet — the provider is unknown until instructions arrive — so they must be identified internally by VRM instead. Provider inference is sometimes possible but the agreed process is: identify on VRM until instructions land.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — verbatim operator workstream item, 2026-07-08.
- TKT-024 (image-only new-case form) and TKT-034 (inbound-image routing) cover the adjacent create/routing halves.

## Proposed change

PROPOSED (not built): (1) rename the image-only case label everywhere it renders (suggest "Images received" or "Awaiting instructions" — must not collide with "Image Based Assessment"); (2) image-only cases are identified/displayed/searched by VRM, with no Case/PO minted until instructions arrive and the provider is known; (3) when instructions arrive the case gains its Case/PO through the normal path.

## Acceptance

- The "Image Based" wording no longer appears for image-only cases anywhere in the SPA; the replacement label is unambiguous vs "Image Based Assessment".
- An image-only case displays its VRM as the primary identifier (lists, case page, search) and has no Case/PO.
- No Case/PO is allocated for a case whose provider is unknown; the normal mint happens when instructions arrive.
- Verified live on an image-only case.

## Research

Distilled 2026-07-08 from the operator workstream note (see Evidence). 

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)
