---
id: TKT-177
title: Resolve likely duplicate cases in one workspace
status: backlog
priority: P1
area: intake
tickets-it-relates-to: [TKT-052, TKT-092, TKT-101, TKT-141, TKT-163]
research-link: docs/tickets/backlog/TKT-177-duplicate-case-resolution-workspace/evidence/duplicates.md
plan: PLAN-004
---

# Resolve likely duplicate cases in one workspace

## Problem
Staff do not have a dedicated place to examine why two or more cases look alike or to record a safe outcome. Registration alone is too weak: one vehicle can have several accidents, including exceptionally two on the same day. A merge must preserve the best details and every related record, while a “distinct cases” decision must stop the same pair repeatedly returning without hiding materially changed evidence.

## Evidence
- [Operator note](./evidence/duplicates.md) — asks for a duplicate-examination page, merge and decline-as-duplicate outcomes, and date-of-incident evidence alongside registration.
- TKT-052 records provider loss during merge; TKT-092 covers unwanted duplicate creation; TKT-101 shows distinct references wrongly linked; TKT-141 excludes retired merge records from counts; TKT-163 owns the existing merge-dialog layout defect.

## Proposed change
PROPOSED (not built): add a “Possible duplicates” workspace that presents candidate groups with a factor-by-factor comparison, then supports two explicit reviewed outcomes: merge into a chosen surviving case or mark the records as distinct. Reuse and harden the canonical merge service rather than implementing UI-only record edits.

The workspace must describe evidence, not announce certainty. Date of incident is a strong factor in both directions but is not an absolute rule because source dates can be corrected and rare same-vehicle/same-day separate accidents do occur.

## Acceptance
- **A1.** Duplicate candidates are generated from an explainable combination of normalized registration, VIN when held, date of incident, provider and provider reference, Case/PO, claimant/insured identity, instruction/message identity, source thread, evidence hashes and existing merge lineage; registration alone never causes an automatic merge.
- **A2.** The signed-in “Possible duplicates” workspace shows each candidate pair/group side by side with the exact agreeing, conflicting and missing factors, source timestamps and links to both full case records. It never hides a conflict behind one confidence score.
- **A3.** Same registration plus same incident date is strong duplicate evidence but never an automatic merge because a vehicle can have separate accidents on the same day. Confirmed, non-empty and materially different incident dates are treated as distinct and suppress that pair; only an explicit, audited correction to a date reopens duplicate review.
- **A4.** “Mark as distinct” records a symmetric pair/group decision with actor, time, reason and the identity snapshot considered. The same unchanged records are suppressed from the queue, but a material change to registration, VIN, incident date, provider reference or merge lineage reopens the comparison with the prior decision visible.
- **A5.** Before merge, staff choose the surviving case and receive a complete preview of field conflicts and the intended disposition of emails, evidence and accepted-image decisions, notes, holds, actions, provider, inspection choice, chasers, archive folders/files, jobs, audit history and identifiers. No field/file is silently discarded or overwritten.
- **A6.** Confirmed merge is server-authorized, transactional or compensatable, idempotent and concurrency-checked. It leaves one canonical active case, preserves every unique related record and byte, deduplicates only by proven stable identity/content hash, retains redirects/tombstones for retired case links, and recomputes readiness from the surviving state.
- **A7.** A completed merge can be reversed only while the retained lineage and downstream state make restoration lossless. The product shows what can and cannot be restored, requires confirmation, records the reversal, and refuses rather than guessing once irreversible downstream work has occurred.
- **A8.** Merge, distinct and reversal audits record the acting staff identity, candidate factors, before/after case IDs and Case/POs, chosen survivor, per-field/file disposition, operation ID and outcome. Handler-facing logs use names and plain actions rather than raw internal values.
- **A9.** Only a Superuser or the existing authorized merge role can perform merge/reversal; permitted case handlers can review and mark distinct according to the agreed policy. Hidden controls are backed by server-side authorization, and stale previews fail safely with a refresh requirement.
- **A10.** Tests cover same VRM/same date, same VRM/different date, rare same VRM/same date but distinct, corrected date, different refs, shared evidence, provider conflict, concurrent edit, response-loss retry, partial Archive failure, safe reversal and reversal refusal; signed-in proof uses only genuine operator-designated work and confirms every naturally available queue, case, Archive and audit outcome without creating test cases in the live app.

## Validation
- **Offline:** exercise candidate scoring as explainable factor output rather than a single opaque decision; run merge-domain/database tests with fault injection, duplicate content and concurrent versions; test suppression/reopening and reversible/irreversible lineage; run UI, accessibility and authorization suites.
- **Signed-in/live:** use operator-designated real candidate pairs and perform only genuine operational decisions approved for those cases; do not seed disposable cases or manufacture an irreversible state. Capture review/mark-distinct/merge/reversal/refusal only as naturally available, reconcile database, Archive and audit records after each approved action, and leave unavailable live classes PENDING while testing them in an isolated non-live environment.
- **Regression:** rerun TKT-052/TKT-092/TKT-101/TKT-141 merge and duplicate-count coverage and verify no production candidate is mutated merely by opening the workspace.

## Research
Distilled 2026-07-13 from the operator's [duplicate-resolution note](./evidence/duplicates.md) and existing merge/duplicate tickets. The candidate model must be validated against real cases before thresholds are chosen.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/duplicates.md)
