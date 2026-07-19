---
id: TKT-270
title: Run the hardcore repository duplication and drift audit
status: backlog
priority: P1
area: platform
tickets-it-relates-to: [TKT-271, TKT-272, TKT-273, TKT-274]
research-link: docs/tickets/backlog/TKT-270-hardcore-repository-drift-audit/evidence/distillation-note.md
plan: PLAN-012
---

# Run the hardcore repository duplication and drift audit

## Problem
PLAN-007–011 each remove one class of duplication or drift, but nothing certifies that no other instance
remains. Without a comprehensive final sweep, an equivalent mechanism, duplicate authority, divergent
cross-language rule, or unsupported live-state claim outside the five plans' scope stays invisible.

## Evidence
The series was scoped from the reconciled review's findings register (A–I plus estate and scripts). That
register was a point-in-time discovery, not an exhaustive proof; the review itself states each finding "earns
its own acceptance evidence" and that execution "must re-inventory". A final audit closes that gap.

## Proposed change
Run read-only, subagent-driven queries across the repository for: (a) structurally equivalent mechanisms
implemented three or more times, comparing contract, owner, lifecycle, security, and failure semantics rather
than text; (b) duplicate authority within the same capability/caller/auth/action lane, while preserving
explicit delegation; (c) cross-language rule divergence; and (d) tracked-doc/`LIVE_FACTS.json` disagreement
plus `LIVE_FACTS.json`/machine-evidence disagreement. Write a dated report. Map each finding to an existing
ticket with exact acceptance coverage, a new backlog ticket when no owner exists, or an intentional exception
with rationale.

## Acceptance
- **A1.** A dated audit report names the audited base/head, tool/query versions, and coverage of equivalent
  mechanisms, duplicate authority by lane, cross-language divergence, tracked-doc/registry disagreement, and
  registry/evidence disagreement. Each finding records paths and the relevant structural, behavioural, or
  evidence-comparison basis; lexical hits alone are not evidence.
- **A2.** Every residual finding maps to an existing ticket whose acceptance lines cover it, a new backlog
  ticket when no owner exists, or a recorded intentional exception. The audit does not create a duplicate
  ticket merely because an existing owner is in another plan.
- **A3.** Discovery queries are read-only. Repository writes are limited to the audit report, this ticket's
  required changes/verification evidence, exact finding-to-owner references in existing or new ticket specs,
  lifecycle stubs for any new tickets, and the generated ticket/governance views needed to keep those
  artifacts in parity. No production source, unrelated ticket status, live state, or `workingspace/` content
  changes.
- **A4.** The report is stored in the ticket `evidence/` and referenced by TKT-271–274 where it drives a guard.
- **A5.** No live write.

## Validation
- The audit report exists, is dated and base-pinned, and lists findings with reproducible evidence. Every
  finding maps to an existing or new ticket or an intentional exception, and a reviewer can re-run the
  read-only queries.

## Research
Distilled from the operator's requirement for a final "hardcore repository check" and the reconciled review's
Gate 0. This audit feeds the standing guards recorded by the rest of PLAN-012.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Distillation note](./evidence/distillation-note.md)
