---
id: TKT-130
title: Review contains only cases that are ready for EVA
status: verify
priority: P1
area: intake
tickets-it-relates-to: [TKT-129, TKT-094, TKT-012, TKT-153, TKT-168]
research-link: docs/tickets/verify/TKT-130-review-queue-readiness/evidence/operator-note.md
plan: PLAN-003
---
# TKT-130 — Review contains only cases that are ready for EVA

## Problem

Cases marked "Needs Review" are not appearing in the Review queue, and cases that are actually complete are being held as missing-fields. Example: A.QDOS26029 has all its images and (as an image-based-assessment provider case) should count as having an inspection address — it should be Ready for EVA. Instead everything piles into Not Ready.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — verbatim operator workstream item, 2026-07-08.
- Operator example: A.QDOS26029 — all images present, image-based provider, still shown with missing fields.
- LIVE_FACTS 2026-07-06 reverify: 52 cases moved needs_review -> missing_required_fields; zero reached ready_for_eva; inspection_address empty on ~171/173 was the gate.

## Proposed change

PROPOSED (not built): (1) queue routing — needs_review cases surface in the Review queue, not Not Ready; (2) readiness — with TKT-129, an image-based-assessment inspection value satisfies the inspection requirement so complete cases reach ready_for_eva; (3) re-evaluate live cases after the fix and record the queue movement.

## Acceptance

- A case in needs_review appears in the Review queue on the deployed SPA.
- An A.QDOS26029-shaped case (all images, image-based provider) evaluates to ready_for_eva after TKT-129.
- Live re-evaluation summary recorded (how many cases left Not Ready and where they went).

## Reopened follow-up — 2026-07-12 (supersedes the earlier queue rule)

The earlier acceptance that every `needs_review` case belongs in Review is explicitly superseded. **Review now means the case has everything required to be theoretically submitted to EVA.** Anything incomplete or problematic is Not Ready unless it is explicitly Held.

### Acceptance
- One shared readiness evaluator determines persisted status, queue membership, dashboard counts, Case Detail checklist and submission eligibility; parallel evaluators cannot disagree.
- Review contains only cases that pass the complete EVA field and image contract with no unresolved blocker. `needs_review` by itself is not sufficient and routes to Not Ready.
- A blank claimant name, blank vehicle model or other required EVA field, unresolved field review/conflict, missing inspection decision, invalid/problematic image set, or all images excluded can never appear in Review.
- At least one accepted usable image set is required. Raw image presence does not satisfy readiness, and zero accepted images is Not Ready.
- Held remains an explicit third state and takes precedence over Review/Not Ready where a hold, duplicate ambiguity or blocking workflow condition applies.
- QDOS26079 and every current Review case with a required-field/image gap are moved to Not Ready or Held with a visible, specific handler-facing reason.
- Regression fixtures cover QDOS26079 shape, blank claimant, blank model, unresolved conflict/review state, all images excluded, missing registration-visible overview, missing damage close-up, valid complete case and explicit hold.
- After deployment, a backup-first idempotent recomputation covers every active case. A residual ledger and independent DB/API/SPA comparison prove identical state/count membership and explain every exception.
- EVA submission independently enforces the same canonical contract so a stale UI or status cannot submit an incomplete case.

## Research

Distilled 2026-07-08 from the operator workstream note (see Evidence). 

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)
- [regression changes](./changes-regression-12-07-26.md)
- [operator follow-up](./evidence/operator-followup-12-07-26.md)
- [code audit](./evidence/readiness-code-audit-12-07-26.md)

## Field-review ruling — 2026-07-13

The blanket “No unresolved field reviews” blocker is removed. A populated, valid value that does not
conflict with another credible source needs no separate per-field confirmation. Review means checking a
complete case before submission, not acknowledging every imported field.

### Acceptance

- Readiness is blocked by a required value only when it is missing, invalid or has a genuine unresolved
  source conflict. A generic `needs_review` marker is not independently blocking.
- A populated non-conflicting work provider, vehicle model, claimant name/contact, incident/instruction date,
  circumstances, VAT status, mileage or mileage unit is accepted without a “mark reviewed” action.
- A genuine conflict identifies the field, candidate values and their sources and provides an explicit
  resolution action. Resolving it records the chosen value/source and clears only that conflict.
- Merely opening a case, viewing a value or entering the Review queue does not write the case, change source
  lineage, clear a conflict or create a “reviewed” audit event.
- Explicit edits, accepted suggestions, conflict resolutions and case submission remain audited user actions.
- Legacy rows blocked solely by blanket field-review state are recomputed idempotently; cases with real
  missing/invalid/conflicting data remain Not Ready with a specific reason.
- The Case Detail checklist, queue membership, dashboard counts and submission endpoint all consume the same
  canonical outcome and never display “No unresolved field reviews” as an un-actionable blocker.

### Validation

- Contract tests enumerate all required fields across populated-valid, missing, invalid, one-source,
  agreeing-multi-source and conflicting-multi-source states and assert one canonical blocker set.
- Interaction tests prove view-only navigation performs no update/audit request and conflict resolution
  changes only the selected field and blocker.
- A backup-first live recomputation ledger separates cases released from the blanket marker from cases still
  blocked for substantive reasons, with DB/API/SPA counts reconciled and an EVA submission counter-probe.

### Follow-up evidence

- [Operator field-review ruling source](./evidence/followup-2026-07-13/issue.md)
