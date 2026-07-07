---
id: TKT-112
title: Reconcile the two image-classification writers
status: blocked
priority: P2
area: ai
tickets-it-relates-to: [TKT-064, TKT-088]
research-link: docs/tickets/blocked/TKT-112-image-writer-reconcile/evidence/operator-note.md
plan: PLAN-001
---

# Reconcile the two image-classification writers

## Problem
Two possible image-classification write paths exist, and enabling both would create contradictory ownership of image role and registration-visible fields.

## Evidence
- [Operator note](./evidence/operator-note.md) — source note distilled for this ticket.
- [PLAN-001](../../plans/PLAN-001-ai-mcp-hardening.md) carries the wider AI/MCP programme context for AI-family tickets.

## Proposed change
PROPOSED (not built):
- Use the TKT-088 operator decision to choose auto-write or suggestion-gated writes.
- Delete or permanently disable the losing path.
- Document the chosen ownership model before extending vision work.

## Acceptance
- Exactly one image classification writer is active or planned.
- The other path is removed, disabled, or documented as superseded.
- Vision tickets TKT-016/TKT-017/TKT-018 proceed only after this is resolved.

## Research
Distilled 2026-07-07 from operator note / plan material; raw material in [evidence/](./evidence/).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
