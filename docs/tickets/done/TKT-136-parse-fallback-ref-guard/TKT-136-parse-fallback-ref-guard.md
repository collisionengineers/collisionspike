---
id: TKT-136
title: Guard the /parse fallback reference against money values and text fragments (RIGERANT R1234YF)
status: done
priority: P2
area: parsing
tickets-it-relates-to: [TKT-103, TKT-071]
research-link: docs/tickets/done/TKT-136-parse-fallback-ref-guard/evidence/operator-note.md
plan: PLAN-003
---

# TKT-136 — Guard the /parse fallback reference against money values and text fragments (RIGERANT R1234YF)

## Problem

TKT-103 guarded the CLASSIFIER reference path, but the /parse document path's _fallback_reference can still capture money values or text fragments — a live case_ref "RIGERANT R1234YF" (a refrigerant spec fragment) was reproduced.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — batch-B workflow finding, 2026-07-09.
- Classifier-wave report remainder 1: the live RIGERANT R1234YF case_ref, reproduced.

## Proposed change

PROPOSED (not built): sibling-first — apply the same money/shape guards + a fragment plausibility check to /parse _fallback_reference; fixture the RIGERANT case; audited data fix for affected live case_ref rows.

## Acceptance

- The RIGERANT sample yields no such case_ref (fixture pinned); money shapes rejected on the /parse path.
- Affected live case_ref rows enumerated + cleared with audit.
- No regression in the sibling suite.

## Research

Filed 2026-07-09 from the classifier-wave batch report (PLAN-003 workflow finding).

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)

## Scope addendum — 2026-07-09 (intake wave)

Fold in the parser-side junk-VRM hygiene the intake wave flagged (sibling-first): the /parse document path should reuse the classifier's month/day + function-word + tight-anchor guards so junk VRMs cannot re-enter via documents (the API-side varchar-guard now drops oversize VRMs, but plausible-shaped junk still passes).
