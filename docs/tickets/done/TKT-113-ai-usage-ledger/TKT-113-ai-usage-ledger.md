---
id: TKT-113
title: AI usage ledger for model capacity controls
status: done
priority: P3
area: ai
tickets-it-relates-to: [TKT-015, TKT-016, TKT-017, TKT-018, TKT-060]
research-link: docs/tickets/done/TKT-113-ai-usage-ledger/evidence/operator-note.md
plan: PLAN-001
---

# AI usage ledger for model capacity controls

## Problem
The AI surfaces share limited model capacity, but there is no common ledger to understand or constrain aggregate usage.

## Evidence
- [Operator note](./evidence/operator-note.md) — source note distilled for this ticket.
- [PLAN-001](../../plans/PLAN-001-ai-mcp-hardening.md) carries the wider AI/MCP programme context for AI-family tickets.

## Proposed change
PROPOSED (not built):
- Add an ai_usage_ledger table with RLS/grants matching existing security patterns.
- Record usage by actor/day with an atomic upsert.
- Use the ledger as a capacity and monitoring input, not as a brittle hard ceiling.

## Acceptance
- Usage rows are written for new AI call sites covered by the ticket.
- RLS and grants follow the ai_suggestion pattern.
- Capacity reporting can separate assistant, classifier, and vision usage.

## Research
Distilled 2026-07-07 from operator note / plan material; raw material in [evidence/](./evidence).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
