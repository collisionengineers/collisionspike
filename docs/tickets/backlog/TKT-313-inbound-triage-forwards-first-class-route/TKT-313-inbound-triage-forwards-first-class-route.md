---
id: TKT-313
title: Inbound-triage rewrite Phase 3 — forwards as a first-class route
status: backlog
priority: P1
area: triage
tickets-it-relates-to: [TKT-312]
plan: PLAN-016
research-link: docs/tickets/next/TKT-310-inbound-triage-ground-truth-corpus/evidence/code-read-2026-07-21.md
---

# Inbound-triage rewrite Phase 3 — forwards as a first-class route

## Problem

A staff-forwarded provider instruction and a direct provider email carry the same intent but
different provenance. The trigger incident was a staff forward that never minted. Both routes
need to be permanent and first-class, not a bolt-on rule (the current `is_forward and not
new_work_phrases` suppressor, TKT-093).

Blocked on TKT-312 (Phase 2): under the new signal-precedence model, this is input
normalisation, not a new rule.

## Change

Not designed. The shape, per PLAN-016: treat a forward from a CE mailbox as a transparent
envelope. The embedded original already lands as a `.eml` item-attachment
(`message/rfc822`, `services/orchestration/src/adapters/graph.ts`). Classify the ORIGINAL
sender/subject/body; keep the forwarder as provenance only. Direct arrivals are unaffected.

## Acceptance

- A staff forward of a genuine new-work instruction promotes identically to the same instruction
  arriving directly, once the precedence engine (TKT-312) classifies the embedded original.
- The forwarder's identity is recorded as provenance and never substitutes for the original
  sender/domain in IDENTITY-tier evidence.
- The TKT-093 forward suppressor's protected behaviour (a forward with no new-work phrases does
  not falsely promote) has a passing eval item before the old rule is deleted.
