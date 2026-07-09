---
id: TKT-139
title: Retro Outlook $search misses spaced-ref variants (Graph tokenization: PHA5007 vs PHA 5007)
status: now
priority: P3
area: intake
tickets-it-relates-to: [TKT-119, TKT-058]
research-link: docs/tickets/now/TKT-139-retro-search-tokenization/evidence/operator-note.md
plan: PLAN-003
---

# TKT-139 — Retro Outlook $search misses spaced-ref variants (Graph tokenization: PHA5007 vs PHA 5007)

## Problem

The Deleted-Items feasibility memo measured a Graph $search tokenization caveat: a ref searched as one token (PHA5007) does not match messages carrying the spaced form (PHA 5007) and vice versa — retro locates can silently miss the other variant.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — intake-wave workflow finding, 2026-07-09.
- TKT-119 evidence/deleted-items-feasibility-memo.md — the measured tokenization caveat.

## Proposed change

PROPOSED (not built): retro locate issues both variants (compact + spaced at the alpha/numeric boundary) and unions results; unit test the variant generator.

## Acceptance

- A ref stored spaced is located by a compact-ref retro request (and vice versa) — proven by a live drain or a recorded Graph query pair.
- Variant generation unit-tested.

## Research

Filed 2026-07-09 from the intake-correctness wave report (PLAN-003 workflow finding).

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)
