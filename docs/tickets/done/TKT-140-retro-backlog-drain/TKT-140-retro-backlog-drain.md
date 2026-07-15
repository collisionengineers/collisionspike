---
id: TKT-140
title: Bulk retro backlog drain — reconstitute prior un-cased emails from Deleted Items
status: done
priority: P2
area: intake
tickets-it-relates-to: [TKT-119, TKT-058, TKT-107]
research-link: docs/tickets/done/TKT-140-retro-backlog-drain/evidence/operator-note.md
plan: PLAN-003
---

# TKT-140 — Bulk retro backlog drain — reconstitute prior un-cased emails from Deleted Items

## Problem

The feasibility memo proved Deleted Items (7.1k/9.5k/7.2k messages) are reachable by the live whole-mailbox $search with no new build, and the PHA5007 drain recovered a real case. A deliberate, operator-paced bulk drain could reconstitute the prior un-cased backlog (refs/VRMs with no case) instead of waiting for chance triggers.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — intake-wave workflow finding, 2026-07-09.
- TKT-119 evidence/deleted-items-feasibility-memo.md; the live PHA5007 drain -> Held case.

## Proposed change

PROPOSED (not built): enumerate un-cased refs/VRMs (Postgres), run the existing retro ladder per key at a throttled pace (read-only Graph; the persist rung mints Held cases only where the ladder succeeds), report per-key outcomes. Operator decides the batch size/window before any run.

## Acceptance

- A dry-run report enumerates recoverable keys with per-rung outcomes (no writes).
- An operator-approved drain window creates Held cases for locatable keys, audited; unlocatable keys carry Unable to locate.
- No mailbox mutations at any point.

## Research

Filed 2026-07-09 from the intake-correctness wave report (PLAN-003 workflow finding).

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)
