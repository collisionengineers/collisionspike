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
remains. Without a comprehensive final sweep, a duplicate mechanism or divergent path outside the five plans'
scope stays invisible.

## Evidence
The series was scoped from the reconciled review's findings register (A–I plus estate and scripts). That
register was a point-in-time discovery, not an exhaustive proof; the review itself states each finding "earns
its own acceptance evidence" and that execution "must re-inventory". A final audit closes that gap.

## Proposed change
Run a read-only, subagent-driven audit across the repository for: (a) mechanisms implemented three or more
times (token mints, HTTP wrappers, retry, hashing, detection), structurally, not by text match; (b)
capabilities reachable by more than one registered path; (c) cross-language rule divergence (TypeScript vs
Python vs vendored); (d) live-state claims in tracked docs that disagree with `LIVE_FACTS.json`. File each
residual finding as a new ticket with its evidence. Change nothing in place.

## Acceptance
- **A1.** A dated audit report inventories any remaining duplicated mechanism, multi-path capability,
  cross-language divergence, and doc/`LIVE_FACTS` disagreement — each with structural evidence (paths,
  import/AST basis), not lexical hits.
- **A2.** Every residual finding is filed as a new ticket (or explicitly ruled intentional with a recorded
  rationale); the report certifies coverage of the four categories or names the gaps.
- **A3.** The audit is read-only — no source, ticket status, or live state is changed by it.
- **A4.** The report is stored in the ticket `evidence/` and referenced by TKT-271–274 where it drives a guard.
- **A5.** No live write.

## Validation
- The audit report exists, is dated, and lists findings with structural evidence; each finding maps to a new
  ticket or a recorded intentional-exception; a reviewer can re-run the read-only queries.

## Research
Distilled from the operator's requirement for a final "hardcore repository check" and the reconciled review's
Gate 0. This audit feeds the standing guards recorded by the rest of PLAN-012.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)
