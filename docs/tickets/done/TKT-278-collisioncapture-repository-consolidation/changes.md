# Changes — TKT-278: Merge collisioncapture into collisionspike

## Phase 1 (in the former collisioncapture repo, not part of this repo's history)

Reconciled the in-flight ticket-system restructuring (branch `codex/guided-camera-feasibility`,
uncommitted) onto `capture-golive` — the branch reflecting deployed reality (correct contract
source-lock pin, live Static Web App routing config, vision-model research) — as
`pre-merge-reconciled`. Fixed one real issue found there: the ported ticket-tooling scripts
(`check-tickets.mjs`, `ticket-move.mjs`, `check-skills-sync.mjs`) needed a Node-globals ESLint
override that didn't exist (`eslint.config.js`). Verified with `npm run verify` + `npm run test:e2e`
before touching this repo.

## Phase 2 — history-preserving code migration

`git filter-repo` extraction of `apps/mobile-web` → `apps/capture-web`,
`packages/{core,contracts,testkit}` → `packages/capture-{core,contracts,testkit}` (26 commits
preserved), merged with `--allow-unrelated-histories` into branch `capture-web-merge`. Root-level
collisioncapture files (`.agents/`, `.claude/`, `.azure/`, `infra/`, its own `docs/tickets/`, root plan
`.md` files) deliberately not carried — redistributed per this repo's own docs taxonomy in Phase 5
instead of ported as-is.

Caught mid-migration: cloning a git-worktree path for the extraction silently clones the repository's
`main` branch, not the specific worktree's checked-out branch — the first merge attempt picked up
`main` (missing `capture-golive`'s 8 commits, including a fix for a hardcoded-date test time-bomb).
Diagnosed via a failing test, corrected before anything was pushed (the local branch was reset and
re-merged against the correct branch).

Hand-fixes on top of the merge: renamed `@collisioncapture/*` → `@cs/capture-*` across all four
packages; fixed `tsconfig.json`/`vite.config.ts` relative paths that still pointed at the old unrenamed
directory names; inlined the shared `tsconfig.base.json` (a root file outside the filter-repo scope)
into each package's own tsconfig; added `@playwright/test` as a `capture-web` devDependency (it was
only ever declared in collisioncapture's root `package.json`); extended this repo's hand-enumerated
root `build`/`test` script chains and root `tsconfig.json` project references; added
`test-results/`/`playwright-report/`/`blob-report/` to `.gitignore` (this repo's first Playwright e2e
suite).

## Phase 3 — contract-generation cutover

Deleted `packages/capture-contracts/openapi/` (vendored OpenAPI copy + `source-lock.json`) and its
package-local `check-capture-contract.mjs` verifier. `packages/capture-contracts`'s `contract:generate`
now points directly at this repo's canonical `contracts/capture.v1.yaml`. Extended the root
`scripts/checks/check-capture-contract.mjs` to verify both generated targets (server + browser) against
the one canonical contract in a single check. Confirmed no-op: the vendored copy was already
byte-identical, so regenerating from the new path produced zero diff.

## Phase 4 — CI consolidation

`.github/workflows/ci.yml`: added a path-filtered `capture-e2e` job running capture-web's Playwright
suite, gated by a new `capture` output on the existing `changes` job (fail-safe toward running, same
pattern as the existing docs-only/code split). `.github/workflows/capture-contract.yml`: extended paths
to include `packages/capture-contracts/**` and `apps/capture-web/**`, and added steps building/testing
the browser side so a contract edit proves both server and browser stay in sync in one workflow run.

## Phase 5 (this commit) — docs, ADR, infra capture

- `docs/architecture/guided-capture.md` — new consolidated architecture doc, replacing collisioncapture's
  separate `architecture.md`/`api-contract.md`/`data-protection.md`/`threat-model.md`; states current
  status (both sides of the flow now in this repo) and the still-open TKT-159 live-gate risk explicitly.
- `docs/adr/0007-receipt-of-images.md` — amended: repository consolidation is not channel selection.
- `docs/adr/0034-guided-capture-repository-consolidation.md` — new ADR recording the merge decision.
- `infrastructure/config-capture/capture-spa.bicep` — captures the live `cespk-capture-spa-dev` Standard
  SWA (West Europe, linked backend `cespk-api-dev`), verified via `az staticwebapp show`.
- This ticket.

## Phase 5 (continued) — ticket-board reconciliation

CCAP-001/002/004/005 and CCAP-006 through CCAP-010 closed as duplicate/absorbed into TKT-200 (verified
route-by-route against shipped code, not assumed from ticket text). CCAP-003/011/012/013/014/015/016/017
renumbered to TKT-279 through TKT-286, each narrowed to the actual remaining gap. CCAP-018 through
CCAP-029 (on-device vision/ML programme) consolidated into PLAN-013, `tickets: []`, roadmap only.

## Phase 6 — retire the standalone repository

- Confirmed zero live deploy pipeline dependencies (no repo secrets/environments/deployments/webhooks).
- Merged `pre-merge-reconciled` into collisioncapture's `main` so the archived snapshot reflects the
  true final state, not an 8-commit-stale one.
- Added a retirement banner (README.md/AGENTS.md) pointing at this repo's ADR-0034/TKT-278.
- The two open PRs against collisioncapture's `main` were auto-recognized as merged once `main`
  advanced; commented on both with a pointer to this merge.
- Archived `collisionengineers/collisioncapture` on GitHub (read-only, not deleted).

All 6 phases of this ticket are now complete.
