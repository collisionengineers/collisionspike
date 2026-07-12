---
id: TKT-034
title: 'Archive unmatched images by registration and adopt the folder into the case'
status: now
priority: P2
area: intake
tickets-it-relates-to: [TKT-003, TKT-004, TKT-006]
research-link: docs/tickets/now/TKT-034-images-received-routing/evidence/operator-note.md
---

# Inbound images: match to case / create Box folder by reg / flag

## Problem
An email was flagged as a "query" but it is actually RECEIVING images for a job. Two needs:
1. Separate the catch-all category into distinct **Enquiries** vs **Case Queries** categories.
2. When images arrive by email, handle them with a defined fallback chain — match to an existing case where possible, else create a registration-keyed Box folder, else flag the email for manual handling.

## Evidence
- `RE Re127581.001_Mr E Taullaj.eml` — an inbound email carrying images for claimant Mr E Taullaj (ref Re127581.001). In this sample NO registration is viewable in the images, and the case does not yet exist on this (new) system, so it is the worst-case fallback: it can't be matched and OCR of a reg would fail — it should land on the flag step.

## Proposed change
PROPOSED:
- Split the "query" bucket into **Enquiries** and **Case Queries** categories (feeds the suggested-categories feature, TKT-006).
- On receiving images by email, run the fallback chain:
  1. **Match to an existing case** by claimant name, prior emails, or client ref — NOT by Case/PO.
  2. **Else create a registration-keyed Box folder** for the images if a registration is viewable (Box-sync, TKT-003; Case/PO + folder naming, TKT-004).
  3. **Else raise a flag on the email** for manual handling.
- The sample lands on step 3 (no match, no viewable reg).

## Acceptance
- Distinct Enquiries vs Case Queries categories exist (no longer a single "query" bucket).
- Image-bearing emails are routed through the 3-step fallback chain (match → reg-keyed Box folder → flag).
- The sample `RE Re127581.001_Mr E Taullaj.eml` lands on the flag step (no case match, no viewable registration), not silently classed as a generic query.

## Reopened follow-up — 2026-07-12

The delivered unmatched-image lane creates an empty registration-named folder only. It neither uploads the images nor persists/adopts that holding folder when later instructions create a Case/PO. The full lifecycle remains unfinished.

### Acceptance
- An unmatched image intake with one defensible registration creates or reuses exactly one normalized-registration holding folder beneath the configured root and persists its inbound/folder association.
- Every accepted image byte is uploaded to that holding folder idempotently; creating an empty folder is not success.
- When later instructions resolve exactly one active case, the workflow locks by registration, creates/reuses the canonical Case/PO folder, transfers or deduplicates the held files, creates the canonical case evidence, and records the adoption.
- After a complete adoption, the empty holding folder is retired according to the approved archive policy. Partial transfer leaves a retryable ledger and never deletes the only copy.
- Zero or multiple case/folder matches are never guessed. The intake/case is visibly Held or needs attention with the candidates and safe staff resolution path.
- Replays, concurrent instructions, duplicate image bytes and mid-transfer failures create no duplicate folder, Box file, evidence row or archive audit.
- Case/PO corrections and merges preserve persisted folder/file identities and do not strand a second registration folder.
- Tests cover holding-folder create/reuse, byte upload, exact adoption, content duplicate, ambiguity, replay, concurrency and failure at every transfer checkpoint.
- Live end-to-end proof uses only Box test root `392761581105`, from unmatched image through later instruction to final Case/PO folder, and records zero writes outside that root.

## Research
Distilled 2026-06-30 from an operator drop-note (one of the `miscategorised-emails` triage corpus); raw material in [evidence/](./evidence). No formal research pack yet.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
- [Regression changes](./changes-regression-12-07-26.md)
- [Operator follow-up](./evidence/operator-followup-12-07-26.md)
