---
id: TKT-240
title: Build the incident-date and principal candidate eliminators
status: backlog
priority: P3
area: intake
tickets-it-relates-to: [TKT-183]
research-link: docs/reviews/160726/decisions.md
---

# Build the incident-date and principal candidate eliminators

## Problem

ADR-0002 (rewritten 2026-07-16) records three candidate eliminators, but only the provider-reference
eliminator is built; the incident-date and principal eliminators are decided-not-built (Review 160726
D13, realignment R5). Candidates that a date or principal conflict should quietly remove instead reach
staff review.

## Evidence

- [Review 160726 decision D13](../../../reviews/160726/decisions.md).
- Current resolution ladder: `services/orchestration/src/workflows/intake/caseResolve.ts`.

## Proposed change

PROPOSED (not built):

- Add an incident-date eliminator: a different incident date removes a correlation candidate. The same
  incident date is not sufficient to attach — the same vehicle can have two accidents in one day — so a
  same-date match requires a corroborating signal (provider reference, accident circumstances, or
  third-party details) and never merges on its own (ADR-0010).
- Add a principal eliminator: a conflicting principal removes a candidate at intake.
- Both record their elimination reason for the staff review trail.

## Acceptance

- A candidate with a conflicting incident date or principal is eliminated with a recorded reason, and
  no eliminator path ever produces a merge.
- Ladder tests cover both eliminators, including the no-elimination ambiguity fallback to staff
  review.

## Research

Distilled 2026-07-17 from [Review 160726](../../../reviews/160726/decisions.md) (D13).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
