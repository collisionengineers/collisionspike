---
id: TKT-063
title: Consolidate release and operator procedures
status: done
priority: P1
area: docs
tickets-it-relates-to: [TKT-058, TKT-178]
research-link: docs/tickets/done/TKT-063-go-live-docs/TKT-063-go-live-docs.md
---

# Consolidate release and operator procedures

## Problem

A release needs clear preflight, deployment, validation, rollback and support instructions. Open actions
must remain ticketed rather than being hidden inside a dated checklist.

## Final treatment — 2026-07-15

The enduring procedures now live in current operations pages:

- [deployment and rollback](../../../operations/deployment.md);
- [diagnostics](../../../operations/diagnostics.md);
- [identity and access](../../../operations/identity-and-access.md);
- [database operations](../../../operations/database.md);
- [Archive operations](../../../operations/archive.md);
- [live environment summary](../../../operations/live-environment.md).

TKT-178 owns the separately authorized production reconciliation. The old dated release pack is retired;
it is not an execution authority and has no pointer stub in the current tree.

## Acceptance

- A new operator can reach preflight, deployment, health validation, rollback and diagnostics from the
  operations index.
- Current resource facts are read from `LIVE_FACTS.json` and the concise environment page.
- Every unresolved action is represented by a ticket with an owner and lifecycle state.
- No procedure implies that repository work authorizes a live write.

## Artifacts

- [Changes](./changes.md)
- [Verification](./verification.md)
