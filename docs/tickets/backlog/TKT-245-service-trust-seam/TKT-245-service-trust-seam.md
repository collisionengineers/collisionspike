---
id: TKT-245
title: Decide and harden the internal service-trust seam (withServiceAuth)
status: backlog
priority: P1
area: platform
tickets-it-relates-to: [TKT-262, TKT-263]
research-link: docs/reviews/160726/decisions.md
plan: PLAN-008
---

# Decide and harden the internal service-trust seam (withServiceAuth)

## Problem

The internal orchestration→Data API routes accept ANY valid Entra token for the API's audience with no
subject or app-role check (`services/data-api/src/features/inbound/internal/service-support.ts:15-35`).
The looseness looks deliberate — one managed-identity caller inside one resource group — but it is
undocumented: nothing records whether it is an accepted trade-off or an oversight, and every new
internal route inherits it silently. Kept deliberately out of the TKT-243 hygiene batch because it is
a security decision, not hygiene.

## Evidence

- Review 160726 second-opinion addition (T8) —
  [decisions register](../../../reviews/160726/decisions.md).
- `services/data-api/src/features/inbound/internal/service-support.ts:15-35`;
  `services/data-api/src/platform/http/register-internal-routes.ts` (the surface that inherits it).
- A second, divergent `withServiceAuth` exists at
  `services/data-api/src/features/archive/mirror-outbox-routes.ts:42-53` (same audience-only policy, separate
  implementation). The sibling outbox routes (`provider-outbox-routes.ts`, `file-request-outbox-routes.ts`)
  already import the shared helper — so this mirror copy is the lone divergent duplicate to fold in.

## Proposed change

PROPOSED (not built):

- Decide the trust model: either affirm audience-only trust as accepted (record the decision and its
  boundary conditions in the platform ADR set), or harden `withServiceAuth` with a subject/app-role
  allowlist for the orchestration identity.
- Apply the decided model uniformly across every internal route registration, and consolidate the two
  `withServiceAuth` implementations into one (folding in the divergent `mirror-outbox-routes.ts` copy) so a
  single seam enforces the policy.
- Record the outcome as an amendment to the platform topology ADR (from the ADR backfill, TKT-246) or
  its own ADR — decided within this ticket.

## Acceptance

- The trust model is decided and documented, and `withServiceAuth` enforces exactly what the decision
  says, uniformly, with tests covering an off-model token being rejected (hardened path) or the
  recorded rationale (affirmed path).
- Exactly one `withServiceAuth` implementation remains after the change; the divergent
  `mirror-outbox-routes.ts` copy is removed and its routes use the single shared seam.

## Research

Distilled 2026-07-17 from [Review 160726](../../../reviews/160726/decisions.md) (second-opinion T8).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
