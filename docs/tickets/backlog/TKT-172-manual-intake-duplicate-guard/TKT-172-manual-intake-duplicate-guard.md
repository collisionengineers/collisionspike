---
id: TKT-172
title: Check matching registrations before Manual Intake creates a case
status: backlog
priority: P1
area: intake
tickets-it-relates-to: [TKT-024, TKT-052, TKT-092, TKT-101, TKT-118, TKT-141, TKT-163, TKT-166]
research-link: docs/tickets/backlog/TKT-172-manual-intake-duplicate-guard/evidence/issue.md
plan: PLAN-004
---

# Check matching registrations before Manual Intake creates a case

## Problem
Manual Intake can create an images-only or instruction-based case without first showing that an open case already uses the same registration. Spaces and letter case can conceal the match. That can create two records for one accident, while a blunt registration-only blocker would also be wrong because the same vehicle can legitimately be involved in separate accidents.

When an images-only record and an instruction-based record appear to describe the same incident, the useful action is to offer a merge/adoption. When the existing and proposed records are the same type, staff need a clear warning they can dismiss after confirming that this is a separate accident.

## Evidence
- [Operator note](./evidence/issue.md) — requires the check in both Manual Intake modes, treats spaced/compact registrations as equal, proposes merge for opposite types and keeps same-type warnings dismissible.
- TKT-118 establishes that an images-only record is identified by registration before instructions and later gains its normal Case/PO.
- TKT-052 and TKT-163 cover merge correctness and layout; this ticket owns the pre-create decision and the server-side race guard.
- TKT-092 and TKT-101 demonstrate the harm of duplicate creation and over-aggressive linking respectively.

## Proposed change
PROPOSED (not built): add a canonical registration preflight to both Manual Intake paths, backed by a server-side recheck at commit. Show likely same-incident candidates with enough context to choose “Use existing case”, “Merge with existing case” or “Create separate case”.

Registration equality finds candidates; it never decides that two accidents are one. Incident date, case type, provider/reference and status determine the wording and available action, and every staff choice is audited.

## Acceptance
- **A1.** Images-only and instruction-based Manual Intake both normalize the entered registration by removing spaces and punctuation and folding case before checking all active, held and pre-case records. AB12 ABC and AB12ABC produce the same candidate set.
- **A2.** When one likely same-incident candidate is the opposite intake type, the screen clearly proposes using/merging into that record rather than opening another. The merge is never executed until the handler confirms the named survivor and sees what will be carried across.
- **A3.** When a likely candidate is the same intake type, Manual Intake shows a warning but permits “Create separate case”. Dismissing the warning records the selected candidate, reason and handler because one vehicle may have separate accidents.
- **A4.** Two confirmed, non-empty and materially different incident dates are treated as separate incidents and do not receive a merge recommendation. A later explicit, audited correction to either date may reopen candidate review; a matching date increases confidence but never auto-merges, and missing dates remain visibly unknown rather than being treated as equal.
- **A5.** Every candidate shows registration, case type, incident date, provider/client reference, status and Case/PO or “Awaiting instructions”, so staff can distinguish an opposite-type continuation from another accident.
- **A6.** The create/merge decision is enforced by the server in the same protected operation as case creation. It rechecks after the warning is shown, detects a candidate created by another user, and cannot be bypassed by stale client state or a direct request.
- **A7.** Registration alone never performs a cross-provider merge, retires a case or overwrites conflicting incident/reference data. Any confirmed merge follows the canonical merge contract, preserves evidence/email/provider ownership and exposes field conflicts for an explicit choice.
- **A8.** Repeated clicks, browser retries and response loss use one operation identity: they cannot create a second case, allocate a second Case/PO, duplicate uploaded evidence or apply a merge twice.
- **A9.** The candidate response is bounded and deterministic when several records share the registration. Staff can choose one, mark the proposed record as a separate incident, or stop; “separate incident” suppresses only that reviewed pair and is reversible/audited.
- **A10.** Automated coverage includes spaced/compact registrations, both intake directions, same/opposite type, same/different/missing dates, multiple candidates, cross-provider candidates, concurrent creation, explicit merge, separate-incident choice and retry; signed-in proof exercises both Manual Intake modes.

## Validation
- **Offline:** add canonical-registration domain tests, candidate-ranking and incident-date matrices, API transaction/concurrency/idempotency tests, merge-contract integration tests and SPA accessibility/interaction coverage for every decision.
- **Signed-in/live:** use naturally occurring, operator-designated real work through an assigned staff account; do not create disposable or seeded cases for proof. Capture the opposite-type merge proposal, same-type dismissible warning and confirmed different-date separation when those real shapes occur, and corroborate the surviving case/evidence set and audit trail. Keep any unavailable live shape PENDING while proving it in an isolated non-live environment.
- **Regression:** rerun Manual Intake upload, images-only adoption, Case/PO allocation, merge/provider preservation, duplicate counts and search suites. Do not merge or retire a production case for verification.

## Research
Distilled 2026-07-13 from the [operator note](./evidence/issue.md). The acceptance deliberately treats registration as candidate evidence, not proof of one incident.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/issue.md)
