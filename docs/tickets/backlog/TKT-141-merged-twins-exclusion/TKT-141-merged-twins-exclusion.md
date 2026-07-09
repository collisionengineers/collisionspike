---
id: TKT-141
title: Exclude merged/retired duplicate cases from twin counts and attention lists
status: backlog
priority: P2
area: dashboard
tickets-it-relates-to: [TKT-092, TKT-012]
research-link: docs/tickets/backlog/TKT-141-merged-twins-exclusion/evidence/operator-note.md
plan: PLAN-003
---

# TKT-141 — Exclude merged/retired duplicate cases from twin counts and attention lists

## Problem

Merged duplicates are retired into the non-terminal linked_to_instruction state, so they still
count in the same-VRM twin badges ("3 open cases share this registration" for PK20FWT) and still
surface under "Check the flagged details" / the Not-ready stage. To staff this reads as "the PCH
duplicates are still there" even though the merge landed.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — tranche-8b verifier finding, 2026-07-09.
- Live: PK20FWT shows "3 open cases share this registration" after the TKT-092 merge; retired rows
  carry mergedInto/mergedBy markers.

## Proposed change

PROPOSED (not built): exclude linked_to_instruction rows carrying a mergedInto marker from the
twin-count derivation, the needs-action/attention lists, and the Not-ready stage counts (they are
resolved, not open work). Keep them reachable from the case page / completed-style views.

## Acceptance

- PK20FWT's twin badge reflects only genuinely-open cases after the merge (1, not 3).
- Retired merged rows absent from the needs-action list and stage counts; still openable directly.
- Count contract stays single-sourced (TKT-012).
- Verified live.

## Research

Filed 2026-07-09 from the TKT-092 verifier residual (PLAN-003 workflow finding).

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence/)
