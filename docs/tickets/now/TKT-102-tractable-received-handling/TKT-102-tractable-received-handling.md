---
id: TKT-102
title: Tractable received-email handling — categorise, match to case, parse PDF, extract images
status: now
priority: P1
area: intake
tickets-it-relates-to: [TKT-024, TKT-034, TKT-003, TKT-093, TKT-103, TKT-104, TKT-145, TKT-193]
research-link: docs/tickets/now/TKT-102-tractable-received-handling/evidence/followup-2026-07-13/tractable.md
plan: PLAN-004
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
raw material in [evidence/](./evidence). The wrong-reference bug is
[TKT-103](../../done/TKT-103-tractable-reference-bug/TKT-103-tractable-reference-bug.md); the deferred API
integration is [TKT-104](../../blocked/TKT-104-tractable-api-integration/TKT-104-tractable-api-integration.md).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)

## Reopened live failure — 2026-07-13

The newest supplied Tractable arrival (`✅ New completed lead Book Ashfaq in today.eml` with
`LINE_LEVEL_ESTIMATE.pdf`) was recognised as Tractable but only offered a link suggestion despite having
one clear target, and none of the submitted vehicle images were extracted. This is the first post-lane
operator occurrence and contradicts the earlier pending assumption that the deployed path merely awaited
traffic. This ruling also supersedes the earlier suggest-first adjudication for an exact-single match.

### Acceptance

- The supplied email/PDF replay classifies as Tractable image delivery and resolves the same single eligible
  active case evidenced by its identifiers; it does not mint a case.
- An exact-single eligible match auto-attaches the email and its PDF to the case without a suggestion card,
  using the same audited, reversible and idempotent policy as TKT-093.
- Manual suggestion is reserved for a concrete ambiguity: zero eligible matches, multiple eligible matches,
  or conflicting Case/PO/provider-reference/registration signals. A unique strong match is not ambiguous.
- The PDF’s Submitted Vehicle Images are extracted, deduplicated and persisted as image evidence on the
  matched case. Decorative marks and logos remain excluded according to the canonical image rules.
- Extracted images enter event-time role/registration/reflection classification, archive mirroring and
  readiness recomputation; the email is not marked fully processed while any required durable step is lost.
- Parse, extraction, attachment or classification failure records the failed stage and a safe retry action in
  handler language. Retrying the same message cannot duplicate email links, PDFs, images, audits or archive
  objects.
- When there is no case yet, the arrival enters the pre-case holding/adoption path in TKT-193 with all source
  material intact rather than opening spurious work or discarding images.
- Existing Tractable fixtures continue to parse vehicle information correctly and the TKT-103 money/reference
  guard remains green.

### Validation

- A fixture-level full-pipeline replay uses the exact Ashfaq `.eml` and PDF, asserting selected case id,
  no suggestion for the exact-single path, deterministic extracted-image identities/count, excluded
  decorative assets and idempotent second execution.
- Counter-fixtures cover no match, two same-VRM active cases, conflicting identifiers, malformed PDF,
  extraction timeout and partial persistence with resume from the first incomplete stage.
- Integration tests prove email/PDF/image rows, audit lineage, classification enqueue, readiness recompute
  and archive outbox commit together or remain durably retryable.
- A supervised signed-in/live replay captures the inbox auto-attachment, database associations, rendered
  images, classification stamps, archive objects and zero duplicate growth after retry.

### Follow-up evidence

- [Operator Tractable failure note](./evidence/followup-2026-07-13/tractable.md)

### 2026-07-21 — inline-parse collapse implemented (PLAN-014 Slice 4b / TKT-295)

The dedicated inline `parse` call this lane made has been REMOVED. Parse now runs ONCE per email,
hoisted above triage, and this image-delivery VRM rung reads that single hoisted `parserVrm` (same
value, one fewer parse — no second, possibly-disagreeing fetch across retries). Behaviour is
preserved: `triedVrm` still means "what the subject/body machinery already tried" and never includes
the parser VRM; the rung is still suggest-first (a VRM-only match never auto-attaches, ADR-0010). The
still-open "auto-attach" acceptance item is unchanged — correctly still suggest-only. See PLAN-014.

