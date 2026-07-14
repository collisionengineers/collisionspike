---
id: TKT-146
title: Classify images at Box-upload event time (the FILE.UPLOADED lane has no classify path)
status: verify
priority: P2
area: evidence
tickets-it-relates-to: [TKT-112, TKT-131, TKT-064, TKT-156, TKT-161, TKT-167, TKT-181]
research-link: docs/tickets/verify/TKT-146-box-upload-event-classify/evidence/followup-2026-07-13/info.md
plan: PLAN-003
---

# TKT-146 — Classify images at Box-upload event time (the FILE.UPLOADED lane has no classify path)

## Problem

Images arriving via Box FILE.UPLOADED register evidence rows but are never vision-classified at event time (the orch classify path only covers email/PDF intake) — they sit role-unknown until a batch backfill.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — final-wave workflow finding, 2026-07-09.

## Proposed change

PROPOSED (not built): per the TKT-112 ownership model (orch owns autonomous stamps), add an event-time classify hop for box_upload evidence (orch queue consumer or an internal API callback), same never-throws semantics.

## Acceptance

- A Box-uploaded vehicle image carries a role + registration_visible shortly after upload (live proof on the test area).
- Failures fall back to role unknown without blocking registration.

## Research

Filed 2026-07-09 from the final-wave D2 report (PLAN-003 workflow finding).

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)

## File-request follow-up — 2026-07-13

The chaser link and case match now work, but images uploaded through that link receive no observable image
analysis. Matching the case is not completion: role, registration visibility and reflection policy must be
applied on this arrival path too.

### Acceptance

- Every supported image uploaded through an Archive file-request link is registered against its matched case
  and receives a terminal analysis outcome within a documented service bound: classified, deliberately
  skipped with reason, or failed with retry state.
- Classification records role (including overview/close-up where supported) and registration visibility;
  reflection checking applies only when the case is not Image Based Assessment, following TKT-161.
- A batch cannot be marked complete while items remain silently queued or unknown. Per-image progress and
  failure are visible without exposing implementation terms, and safe retry does not duplicate evidence.
- One malformed or oversized image cannot starve later images in the same upload batch.
- Classification recomputes readiness and chaser state only after durable stamps are committed; a temporary
  classifier failure cannot falsely make the case ready or remove a needed chaser.
- Consent/policy lookup remains fail-closed and the source email/file-request, evidence row, analysis stamp,
  audit and case are traceable as one lineage.

### Validation

- Integration tests drive the file-request/webhook entry point rather than calling classification directly,
  and cover image-based reflection exemption, non-image file, poison item, retry, duplicate event and
  readiness/chaser recomputation.
- The supplied end-to-end shape is repeated in an isolated non-live environment, with timestamps proving the
  bounded outcome and database/service/UI evidence for each uploaded image.
- Independent live verification observes genuine operator-designated file-request work, captures every
  naturally available successful or failed/retried item, confirms no unknown residue, and reconciles evidence
  count with Archive objects and audit events. Unavailable failure classes remain PENDING; no live case or
  upload is created solely for proof.

### Follow-up evidence

- [Operator file-request end-to-end note](./evidence/followup-2026-07-13/info.md)
