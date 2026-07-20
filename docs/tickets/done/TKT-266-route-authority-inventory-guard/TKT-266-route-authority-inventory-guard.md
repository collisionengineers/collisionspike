---
id: TKT-266
title: Add the route and authority inventory guard
status: done
priority: P2
area: platform
tickets-it-relates-to: [TKT-245, TKT-262, TKT-263, TKT-264, TKT-265]
research-link: docs/tickets/done/TKT-266-route-authority-inventory-guard/evidence/distillation-note.md
plan: PLAN-008
---

# Add the route and authority inventory guard

## Problem
The consolidations in this plan only hold if re-introducing a second authority inside the same caller/auth lane
or a second auth helper fails a check. A capability may legitimately have a staff BFF that delegates to a
focused Function, so raw “one registered path per capability” cardinality would reject the intended topology.

## Evidence
The codebase has two local auth-helper implementations (the second at `mirror-outbox-routes.ts:42`) and route
registrations outside the nominal internal aggregator. It also has legitimate delegation chains such as
staff SPA → authenticated BFF → focused Function, and distinct Archive outbox authorities that must not be
collapsed merely because each uses a monitor. A guard must model capability, owner, caller lane, downstream,
auth mode, action class, write authority, and delegation.

## Proposed change
Add an import/AST-aware route/authority inventory. Within a caller/auth/action lane it rejects two
authoritative writers for one transition, an unowned route, a broken or cyclic delegation, or a second local
auth helper claiming the same policy. An explicit read/proxy delegation to one downstream owner is valid.
Wire it into `verify-all.mjs` with positive and negative fixtures and ship it after TKT-245 and TKT-262–265.

## Acceptance
- **A1.** A guard under `scripts/checks/` builds a capability/caller/auth/action/owner/delegation inventory and
  fails on duplicate authority within one lane, an unowned route, a broken/cyclic delegation, or a second
  local auth helper claiming the internal-trust policy.
- **A2.** The guard is import/AST-aware, not a lexical grep, and does not false-flag the single shared trust
  seam, distinct outbox protocols, or a legitimate staff BFF → focused-Function delegation.
- **A3.** Negative fixtures prove the guard fails on (a) a re-introduced second `withServiceAuth` and (b) a
  second authoritative writer in the same lane; a positive fixture proves an explicit delegation passes.
- **A4.** The guard runs inside `node verify-all.mjs` and in CI; it passes on the current tree after
  TKT-245/262–265 land.
- **A5.** No live write.

## Validation
- Run the guard over the tree (expect pass after the consolidations) and over the two negative fixtures
  (expect fail); confirm `verify-all.mjs` invokes it.

## Research
Distilled from `workingspace/architecture-simplification/02-canonical-service-routes.md` step 5 (optional
route-inventory guard) and the reconciled review's authority/route-graph prescription plus Gate 0 item 12,
then corrected against the current BFF and outbox delegation topology on 2026-07-19.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Distillation note](./evidence/distillation-note.md)
