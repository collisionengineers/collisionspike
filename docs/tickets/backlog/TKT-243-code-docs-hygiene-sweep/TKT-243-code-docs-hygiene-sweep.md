---
id: TKT-243
title: Code and docs hygiene sweep from the 160726 ADR review
status: backlog
priority: P2
area: platform
tickets-it-relates-to: [TKT-057]
research-link: docs/reviews/160726/decisions.md
---

# Code and docs hygiene sweep from the 160726 ADR review

## Problem

The 160726 ADR review surfaced code artifacts that contradict the corrected decision record. None
changes behaviour, but each seeds future drift if left:

- `packages/domain/src/domain/dedup.ts:6-24` — the header claims "merge-by-registration" and
  "test-only"; the live code is the ADR-0010 ladder (`services/orchestration/src/workflows/intake/caseResolve.ts:13,128`).
- `packages/domain/src/contracts/case-status.ts:32-34` and
  `services/orchestration/src/workflows/intake/eva-report-poll.ts:1` — cite ADR-0023 for behaviour that
  belongs to ADR-0008's delivery boundary.
- Code comments describing `A.`/`AP.` as our audit's outcome; the ruling is the original engineer's
  verdict from source material (D1b).
- `MARKERED_PRINCIPALS` (`packages/domain/src/domain/case-type.ts:55-58`) — PCH cannot mint `AP.`
  (coverage gap, D1d).
- `locValue` residue — zero consumers after the ADR-0013 rewrite retired `Loc`.

## Evidence

- [Review 160726 decisions](../../../reviews/160726/decisions.md) D1b, D1d, D4, D11, D12.

## Proposed change

PROPOSED (not built):

- Correct the `dedup.ts` header to describe the ladder it implements.
- Point the two mis-citations at ADR-0008.
- Reword `A.`/`AP.` comments to the source-material verdict rule.
- Add PCH `AP.` support to the marker allowlist, or record why not, per provider corpus rules.
- Remove the unconsumed `locValue` plumbing.
- Sweep "audit" used in the logging sense (audit log / trail / surface) versus the **Audit** case type
  across ADRs, docs, and code; where the logging sense could be confused with the case type, standardise
  to "activity log" (operator note on PR #108).

## Acceptance

- Each listed artifact is corrected or its retention justified in changes.md; builds and tests pass;
  no behaviour change outside the PCH allowlist decision.
- No remaining logging-sense use of "audit" reads as the Audit case type in the touched files.

## Research

Distilled 2026-07-17 from [Review 160726](../../../reviews/160726/decisions.md).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
