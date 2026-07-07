---
id: TKT-102
title: Tractable received-email handling — categorise, match to case, parse PDF, extract images
status: backlog
priority: P2
area: intake
tickets-it-relates-to: [TKT-024, TKT-034, TKT-003, TKT-103, TKT-104]
research-link: docs/tickets/TKT-102-tractable-received-handling/evidence/operator-note.md
---

# Tractable received-email handling — categorise, match to case, parse PDF, extract images

## Problem

**Tractable** is an app Collision Engineers uses to obtain vehicle images: the client photographs the
vehicle → uploads to a portal → the images + a PDF are emailed to CE. Today these "New completed lead…"
emails aren't used to progress a case. They should be recognised, matched to the right case, and their
PDF + images pulled into the case.

## Evidence

- `evidence/operator-note.md` — the Tractable workflow + PDF structure (Vehicle Information:
  make/model/year/VIN/reg/mileage; Submitted Vehicle Images).
- `evidence/tractableexamples/` — `LINE_LEVEL_ESTIMATE.pdf`, `tractable.pdf`, `tractable2.pdf`, and three
  "✅ New completed lead …" `.eml` samples. **This is the shared Tractable sample set** — TKT-103 (the
  reference bug) and TKT-104 (the deferred API) reference these same files.

## Proposed change

PROPOSED (not built):
- Classify the Tractable "New completed lead…" email as its own kind (image-delivery), not new work.
- Match it to its existing case (by VRM / ref in the email/PDF; fall back to flag-for-review when no case
  exists yet — cf. TKT-024/TKT-034).
- Parse the PDF's **Vehicle Information** (make, model, year, VIN, reg, mileage) and the **Submitted
  Vehicle Images**; extract the images and attach/match them into the case (and Box, per TKT-003).

## Acceptance

- A Tractable email is recognised and matched to its case; the parsed Vehicle Information populates the
  matched case; the submitted images are extracted and attached.
- When no case exists, it is flagged for review rather than opening spurious new work.

## Research

Distilled 2026-07-07 from operator drop-note `to-distill/tractable-integration/` (`tractable-received.md`);
raw material in [evidence/](./evidence/). The wrong-reference bug is
[TKT-103](../TKT-103-tractable-reference-bug/TKT-103-tractable-reference-bug.md); the deferred API
integration is [TKT-104](../TKT-104-tractable-api-integration/TKT-104-tractable-api-integration.md).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
