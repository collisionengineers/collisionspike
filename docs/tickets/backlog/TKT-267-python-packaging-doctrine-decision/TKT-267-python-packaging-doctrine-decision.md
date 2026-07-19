---
id: TKT-267
title: Decide and record the Python packaging doctrine
status: backlog
priority: P2
area: platform
tickets-it-relates-to: [TKT-256, TKT-268, TKT-269]
research-link: docs/tickets/backlog/TKT-267-python-packaging-doctrine-decision/evidence/distillation-note.md
plan: PLAN-011
---

# Decide and record the Python packaging doctrine

## Problem
Every Python function service hand-rolls its own token acquisition and retry/backoff, yet
`services/functions/README.md` declares each service "independently packaged". Whether that duplication is a
deliberate doctrine or an accident is unrecorded — so it keeps getting re-litigated, and the duplication keeps
drifting silently.

## Evidence
Verified read-only 2026-07-19: the token/backoff reimplementations are **non-uniform** — across the six
services they diverge by auth mechanism (JWT assertion, client-credentials, MSI, API-key), with some carrying
the full `_CachedToken` + `get_token` + bounded-backoff triad, some missing the cache, and some missing the
bounded backoff; `location-assist/ai_reasoning.py` mints with neither. `services/functions/README.md` states
each service is "independently packaged with its own contract, tests, requirements, and deployment inputs".

## Proposed change
Decide — affirm or reverse — the "independently packaged" doctrine, and record the reasoning in a new ADR (its
number allocated at authoring, expected 0032). **Recommended default: affirm independence** and convert the
duplication into a checked behavioural invariant (TKT-268), because the six focused services do not justify a
shared package feed's coupling and the auth-divergent flows make a single shared helper a poor fit. Consume
PLAN-009's TKT-256 helper-app consolidation assessment as an input — if it recommends collapsing the apps, the
sharing calculus changes and a shared module may become worthwhile.

## Acceptance
- **A1.** A new ADR records the packaging doctrine (affirm independence, or reverse to a shared module) with
  the reasoning, authored at the next free ADR number (not pre-assigned).
- **A2.** The decision explicitly cites PLAN-009's TKT-256 assessment as an input and states how its outcome
  affected the call.
- **A3.** The decision names the follow-on mechanism (TKT-268's behavioural conformance suite on the affirm
  path, or the shared module on the reverse path) and the parity widening (TKT-269).
- **A4.** `services/functions/README.md` is reconciled with the recorded decision (its doctrine line either
  reaffirmed with a pointer to the ADR, or updated).
- **A5.** No live write; no runtime behaviour change in this ticket (decision + ADR only).

## Validation
- The ADR exists, is dated/Accepted, and is linked from the README and the affected services; `check:docs`
  passes.

## Research
Distilled from `05-python-doctrine-and-parity.md` ticket 1; the non-uniformity of finding E and the
"independently packaged" doctrine line were re-verified read-only on 2026-07-19 (`PLAN-011.dossier`).
Deliberately last — consumes PLAN-009's TKT-256.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)
