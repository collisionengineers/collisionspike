---
id: TKT-111
title: Assistant write tier with human confirmation
status: backlog
priority: P2
area: ai
tickets-it-relates-to: [TKT-060, TKT-068, TKT-110]
research-link: docs/tickets/backlog/TKT-111-assistant-write-tier/evidence/operator-note.md
plan: PLAN-001
---

# Assistant write tier with human confirmation

## Problem
The assistant can answer questions but cannot help prepare user-confirmed changes without a safe proposal and confirmation protocol.

## Evidence
- [Operator note](./evidence/operator-note.md) — source note distilled for this ticket.
- [PLAN-001](../../plans/PLAN-001-ai-mcp-hardening.md) carries the wider AI/MCP programme context for AI-family tickets.

## Proposed change
PROPOSED (not built):
- Define write capabilities from shared zod schemas.
- Render a confirmation card from independently fetched state, not model prose.
- Require ETag/updated_at optimistic concurrency on confirmed writes.

## Acceptance
- Assistant writes are gated off by default.
- A confirmed action uses an existing staff-authorized route and 409s on stale state.
- Destructive actions and direct model-issued writes remain excluded.

## Research
Distilled 2026-07-07 from operator note / plan material; raw material in [evidence/](./evidence/).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
