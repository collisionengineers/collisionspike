---
id: TKT-239
title: Suffix concurrent image-first cases on the same registration (-002/-003)
status: backlog
priority: P2
area: intake
tickets-it-relates-to: [TKT-193, TKT-172, TKT-177, TKT-118]
research-link: docs/reviews/160726/decisions.md
---

# Suffix concurrent image-first cases on the same registration (-002/-003)

## Problem

Two concurrent active image-first cases on the same registration share one working identity, so their
VRM-named working folders and evidence can collide
(`services/orchestration/src/workflows/evidence/imagesUnmatched.ts:112`). Review 160726 decided the fix:
`-002`/`-003` suffixes on the temporary registration identity (decided 2026-07-16; not built).

## Evidence

- [Review 160726 decision D6](../../../reviews/160726/decisions.md).
- ADR-0002 (rewritten 2026-07-16) — temporary registration identity and the suffix decision.

## Proposed change

PROPOSED (not built):

- When a second active image-first case opens on a registration, assign `-002` (then `-003`, …) to the
  newer case's working identity; folders and evidence keys follow the suffixed identity.
- On adoption into an instructed Case, collapse to the real Case identity and record the suffix and
  adoption per the archive-holding path.
- Respect the duplicate-guard and holding-adoption behaviour tracked by TKT-172/TKT-193.

## Acceptance

- Two concurrent image-first cases on one registration produce distinct working folders with no
  collision, and both remain visible for staff resolution.
- Adoption collapses the suffixed identity onto the adopted Case with an audit trail.

## Research

Distilled 2026-07-17 from [Review 160726](../../../reviews/160726/decisions.md) (D6).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
