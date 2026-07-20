---
id: TKT-278
title: Merge collisioncapture into collisionspike (repository consolidation)
status: now
priority: P2
area: integration
tickets-it-relates-to: [TKT-200, TKT-159, TKT-102]
research-link: docs/tickets/now/TKT-278-collisioncapture-repository-consolidation/evidence/merge-scope.md
---

# Merge collisioncapture into collisionspike (repository consolidation)

## Problem

The guided-capture browser client lived in a separate `collisioncapture` repository while its server
side (TKT-200) is implemented and deployed in this one. The two-repo split had already produced real,
recurring drift: a stale cross-repo OpenAPI vendor pin, near-duplicate ticket/skill tooling maintained
twice, a documented near-miss where two sessions nearly re-implemented an already-deployed server
because the client repo's docs weren't reconciled after this repo's own reset, and parallel unpushed
work landing on matching branch names in both repos in the same session. See
[the merge scope evidence](./evidence/merge-scope.md) for the concrete incidents.

## Evidence

- [Merge scope](./evidence/merge-scope.md) — the coupling costs this ticket closes, and what stays open.
- [ADR-0007's amendment](../../../adr/0007-receipt-of-images.md#amendment--repository-consolidation-is-not-channel-selection-2026-07-20) —
  this merge does not select in-house guided capture as the committed image-receipt channel.
- [ADR-0034](../../../adr/0034-guided-capture-repository-consolidation.md) — the merge decision and rationale.
- [docs/architecture/guided-capture.md](../../../architecture/guided-capture.md) — the consolidated
  architecture doc replacing collisioncapture's separate `architecture.md`/`api-contract.md`/
  `data-protection.md`/`threat-model.md`.

## Proposed change

IMPLEMENTED (Phases 1-4 of 6; see `changes.md`): history-preserving migration of collisioncapture's
`apps/mobile-web` → `apps/capture-web` and `packages/{core,contracts,testkit}` →
`packages/capture-{core,contracts,testkit}`; contract-generation cutover so
`packages/capture-contracts` generates directly from this repo's canonical `contracts/capture.v1.yaml`
instead of vendoring a pinned copy; CI consolidation (a path-filtered `capture-e2e` Playwright job in
`ci.yml`, `capture-contract.yml` extended to cover the browser side); the docs/ADR work this ticket
itself carries.

Remaining (Phases 5-6, tracked here until closed): reconcile collisioncapture's own `CCAP-*` ticket
board into this repo's `TKT-*` numbering (renumber still-open work, close what TKT-200 already shipped
as duplicate/absorbed, move the not-yet-built vision/ML programme into its own future plan); archive the
standalone `collisionengineers/collisioncapture` GitHub repo once no live deploy pipeline still targets
it and any deploy secrets are migrated.

## Acceptance

- All four merged packages (`@cs/capture-contracts`, `@cs/capture-core`, `@cs/capture-testkit`,
  `@cs/capture-web`) build, typecheck, and test clean alongside the rest of the monorepo.
- `contract:capture:check` verifies both the server and browser generated targets against the one
  canonical `contracts/capture.v1.yaml`.
- CI runs the capture-web e2e suite on capture-related changes without adding cost to unrelated changes.
- `docs/architecture/guided-capture.md` is the one architecture reference for this flow; ADR-0007's
  amendment makes explicit that this merge does not pre-decide the channel-selection question.
- The still-open TKT-159 live-gate risk is carried forward, not silently resolved by this ticket.
- `CCAP-*` tickets are reconciled into this repo's `TKT-*` board (Phase 5, in progress) and the
  standalone repo is archived only after Phase 5/6's checks pass (not yet done).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Merge scope](./evidence/merge-scope.md)
