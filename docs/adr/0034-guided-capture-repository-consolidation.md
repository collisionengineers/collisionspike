# ADR-0034 — The guided-capture browser client is merged into this repository

**Status:** Accepted 2026-07-20 per [TKT-278](../tickets/now/TKT-278-collisioncapture-repository-consolidation/TKT-278-collisioncapture-repository-consolidation.md).

## Decision

The former `collisionengineers/collisioncapture` repository — the browser client for guided photo
capture — is merged into this repository as `apps/capture-web` and
`packages/capture-{core,contracts,testkit}`, history-preserving (`git filter-repo`, 26 commits carried
forward). The browser package generates its transport types directly from this repo's canonical
`contracts/capture.v1.yaml`, replacing the cross-repo vendor-and-pin mechanism collisioncapture
previously used. CI for the browser app (build, unit tests, Playwright e2e) is consolidated into this
repository's own workflows.

Explicitly out of scope for this decision: the desktop-specific surface has no equivalent here
(collisioncapture had none — it is a link-opened PWA, not a native app with a separate release
pipeline). The not-yet-built on-device vision/ML programme (former `CCAP-018`..`029`) is not part of
this merge's engineering scope — it becomes its own future plan, tracked separately, once that work
actually starts.

## Rationale

The two-repo split had already produced real, recurring costs, not hypothetical ones: a stale
cross-repo OpenAPI vendor pin left half-finished; near-duplicate ticket/skill tooling requiring manual
re-porting to stay in sync; a documented near-miss where two sessions nearly re-implemented an
already-deployed server because the client repo's own docs weren't reconciled after this repo's
repository reset; parallel unpushed work landing on matching branch names in both repos in the same
session; and an already-shared Azure resource group (`rg-collisionspike-dev`). See
[the merge-scope evidence](../tickets/now/TKT-278-collisioncapture-repository-consolidation/evidence/merge-scope.md)
for the specific incidents.

This bucks the suite's own 2026-06-23/24 precedent of splitting a monorepo into independent per-project
repositories to decouple lifecycles. That precedent addressed genuinely independent-lifecycle projects;
this pair shares one canonical wire contract across a single browser boundary and already shares
infrastructure — a materially different coupling shape, and the concrete costs above are why this
specific pair is a justified exception rather than a reversal of the general policy.

## Consequences

- `apps/capture-web` changes now pass through this repository's full `verify-all.mjs` gate — a real,
  heavier bar than collisioncapture's own standalone `npm run verify`, not a pure simplification.
- The contract-vendoring round-trip (tag, pin, verify byte-identity, regenerate) is retired for this
  pair; `packages/capture-contracts` generates directly from the canonical source, and
  `scripts/checks/check-capture-contract.mjs` verifies both the server and browser generated targets
  from the one document in a single check.
- collisioncapture's `CCAP-*` ticket board is reconciled into this repository's `TKT-*` numbering
  (tracked under TKT-278) rather than retained as a second prefix — this repository's `check:tickets`
  guard hardcodes the `TKT-\d{3}` shape, and a second prefix would need standing validator changes for
  one feature area.
- This decision does **not** select in-house guided capture as the committed image-receipt channel —
  see [ADR-0007's amendment](./0007-receipt-of-images.md#amendment--repository-consolidation-is-not-channel-selection-2026-07-20).
  That selection remains open.
- The standalone `collisionengineers/collisioncapture` GitHub repository is archived (not deleted) once
  no live deploy pipeline still targets it and any deploy secrets are migrated — a separate, later step
  under TKT-278, not automatic on this ADR's acceptance.
