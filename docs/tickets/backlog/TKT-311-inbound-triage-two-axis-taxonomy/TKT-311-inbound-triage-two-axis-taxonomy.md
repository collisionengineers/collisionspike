---
id: TKT-311
title: Inbound-triage rewrite Phase 1 — taxonomy as two axes (stage x intent)
status: backlog
priority: P1
area: triage
tickets-it-relates-to: [TKT-310, TKT-312]
plan: PLAN-016
research-link: docs/tickets/next/TKT-310-inbound-triage-ground-truth-corpus/evidence/code-read-2026-07-21.md
---

# Inbound-triage rewrite Phase 1 — taxonomy as two axes (stage x intent)

## Problem

The shipped taxonomy is a flat nine-category list. The `emailevals/` corpus that grounds it is
organised as lifecycle **stage** × **intent** — every special-case rule wedged into the
classifier compensates for a dimension the flat taxonomy cannot express. `categoryMintsCase` is
today a hand-maintained list rather than a formula, so a new category can silently omit the mint
check.

Blocked on TKT-310 (Phase 0): the sorted corpus and v4 baseline are this ticket's design input.

## Change

Not designed. The shape, per PLAN-016:

- `stage`: `pre_instruction | new_work | in_progress | post_report | non_case`.
- `intent`: `instruction | update | chase | query | cancellation | billing | acknowledgement |
  automatic | undeliverable | other`.
- `categoryMintsCase` becomes `stage === 'new_work' && intent === 'instruction'` — a formula, not
  a list.
- Recurring `acknowledgement`/`autoreply`/`out-of-office`/`undeliverable` leaves collapse to one
  intent each.
- Bump `taxonomy_version` to 5; retain a v4→v5 projection so `run_ab.py` can score old vs new
  labels during the transition.

## Acceptance

- Every leaf folder in the sorted `emailevals/` corpus maps to exactly one (`stage`, `intent`)
  pair with no residual "doesn't fit" bucket.
- `categoryMintsCase` is derived, not enumerated; a new (stage, intent) pair cannot silently skip
  the mint decision.
- The QDOS forward (TKT-310's manifest item) resolves to `new_work`/`instruction`.
- v4→v5 label projection exists and `run_ab.py` can score both label sets against the same
  corpus.
