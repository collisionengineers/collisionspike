---
id: TKT-109
title: Pre-fill image-based inspections for image-led providers
status: backlog
priority: P2
area: intake
tickets-it-relates-to: [TKT-079, TKT-024]
research-link: docs/tickets/backlog/TKT-109-image-based-provider-prefill/evidence/operator-note.md
---

# Pre-fill image-based inspections for image-led providers

## Problem
Some work providers are overwhelmingly image-based, but the inspection decision still starts blank instead of reflecting that known provider policy.

## Evidence
- [Operator note](./evidence/operator-note.md) — source note distilled for this ticket.
- [PLAN-001](../../plans/PLAN-001-ai-mcp-hardening.md) carries the wider AI/MCP programme context for AI-family tickets.

## Proposed change
PROPOSED (not built):
- Add a provider-policy signal for image-led providers such as QDOS.
- Pre-fill the inspection decision to Image Based Assessment when the provider policy is sufficiently certain, while keeping the handler able to change it.
- Keep the existing address-picker explanation plain and user-facing.

## Acceptance
- Image-led providers pre-fill Image Based Assessment on new applicable cases.
- The pre-fill is auditable and can be changed by staff.
- Providers without the policy keep the current manual choice flow.

## Research
Distilled 2026-07-07 from operator note / plan material; raw material in [evidence/](./evidence/).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
