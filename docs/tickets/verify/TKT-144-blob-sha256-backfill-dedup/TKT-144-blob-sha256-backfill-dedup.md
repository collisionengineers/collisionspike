---
id: TKT-144
title: Resolve the 214 blob-lane same-name duplicate evidence rows via a sha256 backfill
status: now
priority: P3
area: evidence
tickets-it-relates-to: [TKT-133]
research-link: docs/tickets/now/TKT-144-blob-sha256-backfill-dedup/evidence/operator-note.md
plan: PLAN-003
---

# TKT-144 — Resolve the 214 blob-lane same-name duplicate evidence rows via a sha256 backfill

## Problem

214 blob-lane same-name evidence pairs remain undeduplicated because historic blob rows lack sha256 — a byte-hash backfill is needed to distinguish re-sends from genuinely distinct photos before dedup.

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — final-wave workflow finding, 2026-07-09.

## Proposed change

PROPOSED (not built): MI-read each historic blob, compute sha256, stamp the rows, then run the TKT-133 dedup pass over the newly-hashed pairs (audited, backup-first).

## Acceptance

- Historic blob evidence rows carry sha256.
- True duplicates among the 214 pairs deduplicated with audit; distinct photos untouched.

## Research

Filed 2026-07-09 from the final-wave D2 report (PLAN-003 workflow finding).

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)
