# Verification — TKT-278: Merge collisioncapture into collisionspike

## Verdict

IN PROGRESS — Phases 1-4 (history-preserving migration, contract cutover, CI consolidation) and the
Phase 5 docs/ADR/infra-capture work in this commit are complete and verified offline. Phases 5's
ticket-board reconciliation and Phase 6 (archiving the standalone repo) remain outstanding; this ticket
stays in `now` until those land.

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

## Not yet verified

- CCAP-* → TKT-* ticket-board reconciliation has not been executed.
- No attempt has been made to archive the standalone `collisioncapture` GitHub repo, confirm no live
  deploy pipeline still targets it, or migrate any deploy secrets — that is explicitly Phase 6, gated on
  Phase 5 completing first.
- The TKT-159 live-gate risk (public capture gates live-ON without the Front Door ingress-lockdown
  prerequisite) is unchanged by this ticket and remains open under its own ticket.
