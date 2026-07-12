---
id: TKT-158
title: Rerun affected cases safely and account for every residual issue
status: backlog
priority: P1
area: intake
tickets-it-relates-to: [TKT-059, TKT-086, TKT-119, TKT-130, TKT-131, TKT-140, TKT-150, TKT-151, TKT-152, TKT-161]
research-link: docs/tickets/backlog/TKT-158-case-remediation-rerun/evidence/operator-note.md
plan: PLAN-004
---

# Rerun affected cases safely and account for every residual issue

## Problem
After the parser, enrichment, image and readiness fixes are live, all cases affected by known defects must be rerun. Prior wipe/rebuild machinery was intentionally retired because it could not safely reconstruct all case state, so remediation needs a bounded, backup-first replay of derived fields that preserves human decisions and produces a complete residual ledger.

## Evidence
- [Operator note](./evidence/operator-note.md) — rerun every case with issues and verify claimant, circumstances and other fields.
- TKT-059 — evidence that full destructive replay is non-viable and must not be revived.
- TKT-140 — deleted-mail reconstruction covers uncased mail only, not derived-field remediation for all open cases.

## Proposed change
PROPOSED (not built): build a dry-run-first, per-case remediation runner that reuses current parser/enrichment/classification/status seams, changes only missing or defect-owned derived state, and records a field-level before/after/residual ledger.

## Acceptance
- The run starts only after prerequisite claimant, vehicle/mileage, image-policy and readiness fixes are deployed and independently verified.
- A read-only discovery pass enumerates every active Held, Not Ready, Review and error case with a known or detectable issue in claimant, accident circumstances, make, model, mileage, evidence classification/acceptance, inspection decision, archive linkage or readiness status.
- The discovery set and a backup of every row/value to be touched are persisted before mutation; the exact parser/model/config versions and source evidence used are recorded.
- Dry-run output shows proposed field/status/evidence changes and refusal reasons without changing database, Outlook, Blob or Box.
- The acting run reuses current production seams and is idempotent. It does not recreate cases, mint new Case/POs unnecessarily, or revive the retired wipe/rebuild driver.
- Staff-confirmed values, exclusions, photo order, inspection choices, notes, holds, merges, chaser decisions and other human decisions are never overwritten by a weaker derived value.
- Outlook is read-only throughout. Box writes, when required to reconcile evidence, stay inside test root `392761581105` and are individually auditable/retryable.
- Each case receives a field-level before/after result for claimant, accident circumstances, make, model, mileage, accepted/usable images and final readiness, including source/method and why a value did or did not change.
- Status is recomputed from the corrected strict contract: unresolved required detail, zero usable images, any unresolved image problem or other blocker stays Not Ready; only theoretically EVA-submittable cases reach Review.
- Failures do not abort or conceal the rest of the run. The runner is resumable and records per-case failure stage, retry count and final state.
- The final residual ledger accounts for 100% of the discovery set as repaired, source genuinely absent, unresolved conflict, external lookup unavailable/not found, intentionally held, or failed software path requiring a named follow-up ticket.
- Representative before/after cases from every repaired family are manually checked in the SPA and against retained source evidence; no case is certified from database status alone.
- Aggregate invariants show no duplicate active case/PO or registration folder, no orphaned evidence introduced, no loss of human values, and no Review case that fails the final EVA-readiness predicate.
- The runner, query set, operator runbook and exact re-verification commands are committed; a ticket-verifier independently samples and recomputes the final ledger.

## Research
Distilled 2026-07-12 from the operator close-out requirement and supplied lifecycle sketches.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
