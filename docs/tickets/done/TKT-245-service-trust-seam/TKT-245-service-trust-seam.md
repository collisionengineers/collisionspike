---
id: TKT-245
title: Decide and harden the internal service-trust seam (withServiceAuth)
status: done
priority: P1
area: platform
tickets-it-relates-to: [TKT-262, TKT-263]
research-link: docs/reviews/160726/decisions.md
plan: PLAN-008
---

# Decide and harden the internal service-trust seam (withServiceAuth)

## Problem

The internal service→Data API routes accept any valid Entra token for the API's audience with no subject or
app-role check (`services/data-api/src/features/inbound/internal/service-support.ts:15-35`). The looseness is
undocumented: nothing records whether it is accepted or an oversight, and every new internal route inherits it.
There are at least two legitimate live managed-identity callers — orchestration and the Archive webhook
Function — so hardening for only one principal would break the other. This is a security decision, not hygiene.

## Evidence

- Review 160726 second-opinion addition (T8) —
  [decisions register](../../../reviews/160726/decisions.md).
- `services/data-api/src/features/inbound/internal/service-support.ts:15-35`;
  `services/data-api/src/platform/http/register-internal-routes.ts` (the surface that inherits it).
- A second, divergent `withServiceAuth` exists at
  `services/data-api/src/features/archive/mirror-outbox-routes.ts:42-53` (same audience-only policy, separate
  implementation). The sibling outbox routes (`provider-outbox-routes.ts`, `file-request-outbox-routes.ts`)
  already import the shared helper — so this mirror copy is the lone divergent duplicate to fold in.
- `services/functions/box-webhook/data_api_client.py` uses the Function's system-assigned managed identity to
  call `/api/internal/box/case-by-folder/*`, `/api/internal/cases/*/evidence`, `/api/internal/audit`,
  status-evaluate, and mark-done. A read-only live check on 2026-07-19 confirmed both orchestration and the
  Archive Function are Running with distinct system-assigned identities and both carry `DATA_API_URL` and
  `DATA_API_AUDIENCE`.

## Proposed change

PROPOSED (not built):

- Inventory every repository and live caller before deciding the trust model. Either affirm audience-only
  trust with recorded boundary conditions, or harden it with a complete principal allowlist or a dedicated
  app role that admits both orchestration and the Archive webhook caller.
- Apply the decided model uniformly across every internal route registration, and consolidate the two
  `withServiceAuth` implementations into one (folding in the divergent `mirror-outbox-routes.ts` copy) so a
  single seam enforces the policy. Preserve the local mirror helper's observable authentication and handler
  error responses while folding it in.
- Record the outcome as an amendment to the platform topology ADR (from the ADR backfill, TKT-246) or
  its own ADR — decided within this ticket.

## Acceptance

- A repository call-site inventory and read-only live identity/configuration inventory names every legitimate
  caller before the decision is recorded.
- The trust model is decided and documented, and `withServiceAuth` enforces exactly what the decision says,
  uniformly. The hardened path tests orchestration and Archive webhook tokens as admitted and an off-model
  token as rejected; the affirmed path records why audience-only admission is accepted.
- Exactly one `withServiceAuth` implementation remains after the change; the divergent
  `mirror-outbox-routes.ts` copy is removed and its routes use the single shared seam.
- Authentication failures, unexpected authentication failures, and handler failures retain their existing
  status/body/logging semantics across the mirror and shared route sets.

## Research

Distilled 2026-07-17 from [Review 160726](../../../reviews/160726/decisions.md) (second-opinion T8).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
