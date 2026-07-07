---
id: TKT-110
title: Read-only MCP server for external agents
status: verify
priority: P2
area: ai
tickets-it-relates-to: [TKT-060, TKT-066, TKT-069, TKT-107]
research-link: docs/tickets/verify/TKT-110-mcp-readonly-server/evidence/operator-note.md
plan: PLAN-001
---

# Read-only MCP server for external agents

## Problem
External agents need a supported way to read case data without bypassing the Data API authorization boundary or gaining write capability.

## Evidence
- [Operator note](./evidence/operator-note.md) — source note distilled for this ticket.
- [PLAN-001](../../plans/PLAN-001-ai-mcp-hardening.md) carries the wider AI/MCP programme context for AI-family tickets.

## Proposed change
PROPOSED (not built):
- Add a Streamable-HTTP MCP endpoint on the Data API surface.
- Expose only registry-described read tools in the first release.
- Document Flow A/Flow B auth boundaries in ADR-0023 before any autonomous write work.

## Acceptance
- An interactive MCP client can list and call read-only tools when authenticated as an assigned staff user.
- Unauthenticated or wrong-audience tokens fail closed.
- No write or destructive capability is exposed through MCP.

## Research
Distilled 2026-07-07 from operator note / plan material; raw material in [evidence/](./evidence).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
