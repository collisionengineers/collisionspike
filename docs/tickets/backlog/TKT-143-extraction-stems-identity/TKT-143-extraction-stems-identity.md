---
id: TKT-143
title: Pass the resolved provider/VRM into /extract-images so extraction filenames carry real identity
status: backlog
priority: P3
area: evidence
tickets-it-relates-to: [TKT-090]
research-link: docs/tickets/backlog/TKT-143-extraction-stems-identity/evidence/operator-note.md
plan: PLAN-003
---

# TKT-143 — Pass the resolved provider/VRM into /extract-images so extraction filenames carry real identity

## Problem

The extraction path omits provider/VRM tokens when unresolved (the TKT-090 fix), but the cloud adapter never passes the RESOLVED values either — extraction stems could carry real identity when it is known at extraction time.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — lifecycle-wave workflow finding, 2026-07-09.

## Proposed change

PROPOSED (not built): thread the resolved work-provider principal + VRM from the orchestration context into the /extract-images call so stems read e.g. QDOS_AB12CDE_img_1_1.png when known; keep the omit-when-unknown behaviour.

## Acceptance

- An extraction on a resolved case produces stems carrying the real principal + VRM.
- Unresolved cases keep the neutral stems; fixtures updated.

## Research

Filed 2026-07-09 from the lifecycle-wave report (PLAN-003 workflow finding).

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence/)
