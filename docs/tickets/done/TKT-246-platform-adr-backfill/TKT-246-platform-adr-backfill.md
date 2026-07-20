---
id: TKT-246
title: Backfill the platform ADRs (0026–0030)
status: done
priority: P1
area: docs
tickets-it-relates-to: [TKT-245]
research-link: docs/reviews/160726/decisions.md
---

# Backfill the platform ADRs (0026–0030)

## Problem

Five load-bearing platform decisions are built and live but have no decision record, so nothing stops
a future change contradicting them unknowingly. Review 160726's second-opinion session directed a
backfill as one ticket, with the operator drafting/approving the decisions separately. ADR numbers
**0026–0030 are reserved** for this ticket.

## Evidence

- [Review 160726 decisions](../../../reviews/160726/decisions.md) — second-opinion ruling (T9).
- The five decisions and their anchors:
  1. **RLS as final authorization** — non-owner `cespk_app` role, per-connection `app.role`
     (`services/data-api/src/platform/db/client.ts:10-24`,
     `infrastructure/config-capture/api.bicep:39-46`).
  2. **Ship-dark gate model** — a single gated dev environment; features ship deploy-gated
     (`packages/domain/src/gates.ts`; LIVE_FACTS `deliberatelyUnavailable`/`safetyGates`).
  3. **Three-tier compute topology** — SPA → Data API → Durable orchestration → focused Python
     services.
  4. **Staff identity** — in-code jose JWT validation, `authLevel` anonymous, MSAL PKCE
     (`services/data-api/src/platform/auth/staff-auth.ts:1-151`).
  5. **Outbox / generation-counter reliability** —
     `services/data-api/src/features/archive/mirror-outbox.ts`, `database/migrations/*-outbox.sql`.

## Proposed change

PROPOSED (not built):

- The operator drafts or approves each decision; this ticket then records ADRs 0026–0030 in house
  style, present-tense for the built facts, each linking its realizing documents.
- Update the ADR README rows and keep the number reservation intact until all five land.

## Acceptance

- ADRs 0026–0030 exist, operator-approved, in house style with realization back-links, and the ADR
  README lists them; `npm run check:docs` passes.

## Research

Distilled 2026-07-17 from [Review 160726](../../../reviews/160726/decisions.md) (second-opinion T9).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
