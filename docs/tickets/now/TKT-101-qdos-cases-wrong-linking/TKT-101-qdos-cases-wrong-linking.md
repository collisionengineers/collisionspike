---
id: TKT-101
title: QDOS — two distinct refs (46671/1, 46533/1) wrongly linked as one case
status: now
priority: P1
area: intake
tickets-it-relates-to: [TKT-092, TKT-051, TKT-065, TKT-100]
research-link: docs/tickets/now/TKT-101-qdos-cases-wrong-linking/evidence/operator-note.md
---

# QDOS — two distinct refs (46671/1, 46533/1) wrongly linked as one case

## Problem

Two QDOS emails for **different people** with **different QDOS reference numbers** (`46671/1` and
`46533/1`) were linked into the **same** case. This is a wrong-merge / dedup-key collision — the inverse
failure mode to TKT-092 (PCH cases *duplicating*): here two genuinely-separate matters are being
collapsed into one.

## Evidence

- `evidence/operator-note.md` — "46671/1 and 46533/1 were linked as the same case but clearly different
  people and external (QDOS) reference numbers on email".
- `evidence/46533_1 - Barry Pavlou..eml`, `46640_1 - Andy Smith.eml`, `46670_1 - Mohammed Jameel.eml`,
  `46671_1 - Michael McCarthy.eml` — the QDOS samples.
- Possibly correlated with the false "AND2" VRM ([TKT-100](../../done/TKT-100-qdos-false-vrm-and2/TKT-100-qdos-false-vrm-and2.md)):
  if every QDOS email resolves the same bogus VRM, a VRM-based dedup key would collapse them — so verify
  whether the linking vector is the shared false VRM.

## Proposed change

PROPOSED (not built):
- Trace the dedup/linking key used for QDOS intake; name the collision vector (VRM-based key colliding on
  the false AND2, a ref-parse miss, or a conversation/thread match).
- Fix idempotency so distinct QDOS refs resolve to distinct cases; audited un-merge/split of the affected
  live cases.

## Acceptance

- The two QDOS refs (`46671/1`, `46533/1`) resolve to **two separate** cases.
- Regression coverage for the QDOS linking key; affected live cases un-merged with an audit trail.

## Research

Distilled 2026-07-07 from operator drop-note `to-distill/qdos-error/`; raw material in
[evidence/](./evidence). The false-VRM half of the same note is
[TKT-100](../../done/TKT-100-qdos-false-vrm-and2/TKT-100-qdos-false-vrm-and2.md).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
