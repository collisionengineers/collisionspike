---
id: TKT-088
title: Image role auto-classification — confirm whether it works and decide the path
status: blocked
priority: P2
area: evidence
tickets-it-relates-to: [TKT-064, TKT-002, TKT-016]
research-link: docs/tickets/TKT-088-image-role-classification-check/evidence/operator-note.md
---

# Image role auto-classification — confirm whether it works and decide the path

## Problem

Operator: "Need to determine if the role classification for images is functional. If not, need to
[ask the user] to determine what we are doing with this." The screenshots show case evidence
images all sitting at **Role: Unclassified** (dropdown offers Overview / Damage closeup /
Additional / Unclassified), with the banner "No photo shows a readable registration yet — a
vehicle overview with the full number plate is still needed" — i.e. nothing is being
auto-assigned, and the EVA image-rule gate (≥2 EVA images incl. one overview with visible
registration + one damage closeup) stays red until staff classify by hand.

## Determination (already answerable from the repo)

Auto role classification is **not functional — it was never built**.
[TKT-064](../TKT-064-image-classification/TKT-064-image-classification.md) (operator-raised
2026-07-05) records: image role is unbuilt (deferred M2/ADR-0009, defaults `unknown`), and
registration OCR runs only on PDF-extracted images. The screenshots are consistent with that.
Re-confirm against the current registry/gates when picked up, then this ticket becomes the
**operator decision**:

## Operator decision needed (why this is blocked)

1. **Build auto-classification now** — promote TKT-064 (vision classifier for role +
   registration-visible detection + backfill) into `next`/`now`; this ticket closes as the
   decision record.
2. **Stay manual, improve the UX** — keep hand-classification but make it fast (bulk role
   assignment, keyboard flow, clearer gate messaging); scope that as a new UI ticket.
3. **Defer** — accept manual classification for now; close this ticket with the decision noted.

## Evidence

- `evidence/operator-note.md` — verbatim drop-note.
- `evidence/evidence-images-all-unclassified.png` — case images all `Unclassified`, EVA-gate
  banner showing.
- `evidence/role-dropdown-options.png` — the role dropdown (Overview / Damage closeup /
  Additional / Unclassified).
- [TKT-064](../TKT-064-image-classification/TKT-064-image-classification.md) — the unbuilt
  classifier work this decision feeds.

## Proposed change

PROPOSED (pending the operator decision):

- Record the decision here, then either activate TKT-064, open a manual-UX ticket, or close.

## Acceptance

- [ ] The non-functionality determination is re-confirmed against the live stack (spot-check a
      recent case's `evidence_image` role values — all `unknown`/unclassified unless staff-set).
- [ ] The operator's decision (build / manual-UX / defer) is recorded in this folder and the
      chosen follow-up ticket is created or re-prioritised on the board.

## Verification requirements (proof standard)

1. **Live spot-check** — a Postgres query over recent evidence-image rows showing role values are
   never auto-populated, recorded in [verification.md](./verification.md).
2. **Decision record** — the operator's answer + date in [evidence/](./evidence/); board updated
   accordingly.

## Research

Distilled 2026-07-06 from the operator drop-note folder `to-distill/image-sections/`; raw
material in [evidence/](./evidence/).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
