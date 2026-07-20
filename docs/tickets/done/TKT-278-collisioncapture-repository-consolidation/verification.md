# Verification — TKT-278: Merge collisioncapture into collisionspike

## Verdict

DONE — all 6 phases complete. History-preserving migration, contract cutover, CI consolidation, docs/
ADR/infra-capture work, CCAP-* → TKT-* ticket-board reconciliation, and retiring the standalone
`collisioncapture` GitHub repository (banner commit + archive) are all done and verified.

## Evidence

- All 4 merged packages (`@cs/capture-contracts`, `@cs/capture-core`, `@cs/capture-testkit`,
  `@cs/capture-web`) build (`tsc`/`vite build`), typecheck, and test clean.
- The full pre-existing collisionspike monorepo test suite (2,969 tests: domain, server-runtime, api,
  orchestration, web) plus 172 new capture-core/capture-web tests all pass together.
- `capture-web`'s Playwright e2e suite (8 tests, Mobile Chrome + Mobile Safari) passes.
- `npm run contract:capture:check` passes (redocly lint + the dual-target — server and browser — drift
  check).
- Every individual `verify-all.mjs` check passes: layout, source-size, forbidden-references, inventory,
  tree, adapters, guard-register, tickets, doc-links, live-facts, derivation, runtime-contract,
  production-dependencies, scripts-dedup, tracked-outputs, line-endings, managed-identity,
  route-authority, auth-inventory, cross-language parity, binary-content.
- `infrastructure/config-capture/capture-spa.bicep` compiles offline (`az bicep build`) and its captured
  facts (Standard SKU, West Europe, linked backend `cespk-api-dev`) were verified live via
  `az staticwebapp show --name cespk-capture-spa-dev --resource-group rg-collisionspike-dev` on
  2026-07-20.

## Phase 6 evidence

- Confirmed via `gh secret list`, `gh api .../environments`, `gh api .../deployments`, and
  `gh api .../hooks` on `collisionengineers/collisioncapture`: zero repo secrets, zero environments,
  zero deployments, zero webhooks — no live deploy pipeline was tied to this repository (the live
  `cespk-capture-spa-dev` SWA was provisioned directly via the SWA CLI, confirmed earlier by
  `az staticwebapp show` showing `repositoryUrl: null`, `provider: "SwaCli"`).
- Brought `main` up to the true final state (merged `pre-merge-reconciled`, which already carried
  `capture-golive`'s and `capture-build`'s content) before archiving, so the archived snapshot isn't
  8 commits stale.
- Added a retirement banner to `README.md`/`AGENTS.md` pointing back at this ADR-0034/TKT-278.
- The two open PRs (`capture-golive` → main, `capture-build` → main) were auto-recognized by GitHub as
  merged once `main` advanced past their diffs; commented on both with a pointer to this merge.
- Repository archived (read-only, not deleted) via `gh repo archive`; confirmed `isArchived: true`.

## Carried forward, not resolved by this ticket

The TKT-159 live-gate risk (public capture gates live-ON without the Front Door ingress-lockdown
prerequisite) is unchanged by this ticket and remains open under its own ticket (TKT-159, with
TKT-282/TKT-286 as its follow-ups in the guided-capture area).
