---
id: TKT-104
title: Tractable API integration (deferred — blocked on vendor docs)
status: blocked
priority: P3
area: intake
tickets-it-relates-to: [TKT-102, TKT-055]
research-link: docs/tickets/blocked/TKT-104-tractable-api-integration/evidence/operator-note.md
---

# Tractable API integration (deferred — blocked on vendor docs)

## Problem

Beyond handling the received Tractable email (TKT-102), Tractable has **API compatibility** that would let
CE (1) generate Tractable links in-app and send them to a customer (by button or automatically), and (2)
directly integrate received items into a case via API. This is a future integration and cannot be
specified yet.

## Blocked on

**Awaiting Tractable developer docs** for the full integration details (vendor dependency — an operator/
external action, not code we can write today).

## Evidence

- `evidence/operator-note.md` — "Deferred items for future integration" (the operator's note that Tractable
  has API compatibility, plus the two capabilities, and that developer docs are awaited).

## Proposed change

PROPOSED (deferred — not built):
- Once vendor docs land: in-app Tractable link generation to customers; direct case ingestion of received
  items via the Tractable API (sits alongside the provider-API intake channel, TKT-055).

## Acceptance

- Deferred. Design + acceptance to be written once Tractable's developer docs are supplied. Until then the
  received-email path (TKT-102) covers the immediate need.

## Research

Distilled 2026-07-07 from operator drop-note `to-distill/tractable-integration/` (`tractable-deferred.md`);
raw material in [evidence/](./evidence). Consider a one-line pointer in
[docs/gated.md](../../../gated.md) for the vendor-docs dependency. The immediate received-email handling is
[TKT-102](../../now/TKT-102-tractable-received-handling/TKT-102-tractable-received-handling.md).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
