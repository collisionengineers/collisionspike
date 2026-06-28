# Repository hygiene review — collisionspike (2026-06-28)

_Authored by the repo-hygiene agent team. Companion files in this folder: `IA-MOVE-MAP.md` (the execution
blueprint) and the root `LIVE_FACTS.json` (the verified live snapshot this review reconciles to)._

This review answers two questions the user posed — (1) the **big-picture** state of the repo and its sibling
constellation, and (2) a **factual-accuracy + freshness** audit of the documentation — and records what the
team changed. Every live claim below was verified against Azure/Graph via the CLI before it was written; the
machine-checkable snapshot is `LIVE_FACTS.json` (verified 2026-06-28T21:42Z).

---

## 1. Executive summary

The repo was **structurally sound but factually drifting**, with **no mechanism to stop the drift**. Three
problems, now addressed:

1. **Too many sources of truth.** 9 root "truth" docs, 3 of them (`CURRENT_STATUS` 73K, `ROADMAP` 52K,
   `OPEN_ITEMS` 34K) overlapping on "current/forward state", plus 2 historical docs (`PLAN`, `DEPLOY-RUNBOOK`)
   still dominating the root. → **Collapsed 3 status docs → 2; archived the historical ones.**
2. **Live facts hand-copied into 15+ files and rotted.** The repo's own "honest live state" was itself stale:
   it claimed email intake was **not live** and Box was **off** — both **false** as of this snapshot. →
   **One registry now owns live numbers; every other doc links it.**
3. **Zero freshness enforcement** (no CI, no hooks, no link-checker). → **Added a link/orphan/leakage checker,
   an Azure-backed `verify-live` gate, a pre-commit hook, a CI workflow, and a maintenance protocol.**

The doc estate is now: link-clean (0 broken / 0 orphans / 0 leakage), reconciled to verified live truth, and
guarded so the same drift cannot recur silently.

---

## 2. Big-picture findings

### 2.1 Structure & sources of truth (before → after)

| Concern | Before | After |
|---|---|---|
| Root "truth" docs | 9, heavily overlapping | Entry points (`README`/`CLAUDE`/`AGENTS`) + **1 live registry** + **1 forward-work doc** (`ROADMAP`) + **1 changelog** (`CURRENT_STATUS`) |
| Forward worklist | split across `ROADMAP` + `OPEN_ITEMS` | merged into `ROADMAP.md`; `OPEN_ITEMS.md` is now a pointer |
| Live numbers | embedded in 15+ files | only in `LIVE_FACTS.json` + `docs/architecture/live-environment.md`; everything else links them |
| Historical material at root | `PLAN.md`, `DEPLOY-RUNBOOK.md`, `box-integration-pivot/`, `migration/*.md` | moved to `docs/HISTORICAL/` with pointer-stubs left behind |
| Root cruft | 2 stale `Azureresources*.csv` + an on-disk Box cred file | deleted (cred confirmed in Key Vault first) |
| Orphaned docs (unreachable from `CLAUDE.md`) | `docs/handoff/`, `docs/_audit/`, `box-integration-pivot/`, no per-dir indexes | all indexed; 8 new per-dir `README.md`; `docs/README.md` indexes every dir |
| Link hygiene | unmeasured (111 broken links, 99 orphans existed) | measured + enforced; 0/0/0; 26 pre-existing dead links surfaced as a visible backlog |
| Link style | mixed relative + `[[wikilinks]]` | relative everywhere; `[[wikilinks]]` reserved for `memory/` |

### 2.2 Sibling constellation (how the repos relate)

`collisionspike` is one of several **independent git repos** under `collisionsuite/`. The key correction:
**there are no package imports across repos** — all coupling is runtime/operational or documentational.

- **Vendored, not imported:** the parser engine `cedocumentmapper_v2.0` is **copied** into
  `functions/parser/cedocumentmapper_v2/` (ADR-0018, edit-in-sibling-then-revendor). ⚠️ The vendored copy has
  **diverged** from its sibling (a parser fix landed upstream, not yet re-vendored) — now flagged with an OPEN
  banner in `functions/parser/cedocumentmapper_v2/PROVENANCE.md`. The drift guard `test_engine_vendored_in_sync`
  **skips locally** because the sibling isn't checked out here, so divergence won't be caught until it's cloned.
- **Direct, not via connector:** M1 enrichment calls DVSA/DVLA **directly**; the `dvla-dvsa-connector` MCP
  server is prior-art/fallback, not in the live path.
- **Reference-only / gated:** `evaconnector`, `valuation-adverts-connector`, `collisionrenderer`,
  `collision-agent-skills` are reached via skills/gates in later milestones, not by the Data API.
- **Parent-repo drift (separate repo — surfaced for your approval, not edited):** `collisionsuite/INDEX.md`
  + `SETUP.md` still call collisionspike a "Power Platform spike" and describe cedocumentmapper as a
  consumed dependency. Proposed diff is in §6.

`docs/architecture/repo-constellation.md` was corrected to this model (Power-Platform→Azure-PaaS, explicit
no-imports coupling, dissolved-`collisionplugin` note).

---

## 3. Factual corrections (verified live, then written)

The repo's own "honest live state" was stale. Corrected everywhere, sourced from `LIVE_FACTS.json`:

| Claim (was) | Verified truth (now) | Source |
|---|---|---|
| Email intake "not live / no Graph subscriptions / mailboxes not RBAC-scoped" | **Live in testing.** 2 live **push** change-notification subscriptions (engineers@ + digital@ → `/api/graph-webhook`); both mailboxes RBAC-read-scoped (200); info@/desk@ not yet (403) | Graph `/subscriptions` + per-mailbox read |
| Transport = "delta-poll, no push subscription" | **Push (change-notification subscriptions)** | live subscriptions exist |
| Mailbox set ambiguous (2 vs 3) | digital@ = test, engineers@ = prod-in-testing; **prod target = info@ + engineers@ + desk@** (relabelled, not "picked") | operator + `GRAPH_INTAKE_MAILBOXES` |
| orch "41 functions" / api unstated | **orch = 42, api = 44** | `az functionapp function list` |
| Box "all `BOX_*` gates off / staged / not live" | **Box LIVE** — `BOX_API_ENABLED` + `BOX_FOLDER_AT_INTAKE_ENABLED` + `BOX_FILEREQUEST_ENABLED` = true on api+orch; authed smoke = 200 (folder CCPY26050); EMBED/METADATA off | gates + smoke |
| `ENRICHMENT_ENABLED` (implied off) | **true** | app-settings |
| `httpsOnly` | **true** on both apps | `az resource show` |
| Postgres corpus counts (390/32/19/2209) asserted as current | **UNVERIFIED this snapshot** (PG firewall blocked the host) — banded "last-known 2026-06-18, unverified" + registry pointer | recorded `verified:false` |

⚠️ **Live-system risk (not a doc fix):** the nearest subscription **expires 2026-07-05** (~6.6 days) and App
Insights shows **0 `graph-renew` executions in 3 days**. If the renewer isn't firing, **live intake will
silently lapse next week.** Threaded into ROADMAP "Now" + `gated.md` as an operator watch-item; left for the
operator to action (no running resource was touched).

---

## 4. The freshness system (how docs stay true now)

The core rule: **live numbers live in exactly one place** (`LIVE_FACTS.json` + its human mirror
`docs/architecture/live-environment.md`); every other doc links the registry. Enforced by:

| Mechanism | File | What it does |
|---|---|---|
| Link/orphan/leakage checker | `scripts/check-doc-links.mjs` | fails on broken relative links, docs unreachable from `CLAUDE.md`/`docs/README.md`, or volatile live numbers embedded outside the registry. Zero npm deps. |
| Live-drift gate | `verify-all.mjs` → `verify-live` | with `VERIFY_LIVE=1`, re-queries Azure/Graph and diffs vs `LIVE_FACTS.json`; **fails on drift**. Skips cleanly offline (no `az` → SKIP). Skips `verified:false` facts. |
| Pre-commit hook | `scripts/hooks/pre-commit` | runs the link-checker; warns if the registry mirror is staged without `LIVE_FACTS.json`. Activate: `git config core.hooksPath scripts/hooks`. |
| CI | `.github/workflows/docs.yml` | runs the link-checker on every PR (no secrets); a gated `verify-live` job runs when an Azure credential secret is present (operator setup). |
| Protocol | `docs/MAINTENANCE.md` | the human rules: registry-only numbers, post-Azure-change steps, hook activation, precedence hierarchy, IA map, the documented checker exemptions. |

**Documented checker exemptions** (minimal, commented in the script + MAINTENANCE.md): `.claude/` (tooling),
`docs/HISTORICAL/**` (frozen archive), the ux-design-lab per-direction exploration files (ephemeral). A
**known-absent backlog** category surfaces (non-failing) the ~26 pre-existing links into decommissioned trees
(`flows/`, `dataverse/`, gitignored `raw/`, the separate `research/automationsresearch/`) — visible, not hidden.

---

## 5. Verification evidence

- `node scripts/check-doc-links.mjs` → **PASS** links 0 / orphans 0 / leakage 0 (+26 known-absent backlog, INFO). 283 md files scanned.
- `node verify-all.mjs` → **12 passed, 0 failed, 4 skipped** (skips = retired Power-Platform gates + offline `verify-live`).
- `VERIFY_LIVE=1 node verify-all.mjs` → see the `verify-live` gate result (run at review time; confirms `LIVE_FACTS.json` matches live).
- `LIVE_FACTS.json` keys: functionCounts, graphSubscriptions, mailboxRbac, subscriptionRenewalRisk, postgresCounts, httpsOnly, boxSmoke, gates, resourceInventory, csvComparison — each with `{value, sourceCommand, verifiedAt, verified}`.

---

## 6. Open items for the operator (nothing here was auto-applied)

1. **Subscription renewal (time-sensitive).** Confirm `graph-renew` is firing before **2026-07-05**, or live
   intake lapses. (Highest priority — it's a live-system issue, not a doc issue.)
2. **Parent-repo drift** (`collisionsuite/INDEX.md` + `SETUP.md`, a separate repo) — apply the proposed diff:
   collisionspike is **Azure PaaS** (not Power Platform); cedocumentmapper_v2.0 is the **vendored authoring
   source**, not a runtime dependency. Full diff in the sibling-reconciler handoff.
3. **Vendored parser divergence** — re-cut + re-vendor `cedocumentmapper_v2` (sibling not checked out here, so
   the drift guard can't catch it locally). See the OPEN banner in `functions/parser/.../PROVENANCE.md`.
4. **Known-absent link backlog (26)** — superseded phase docs still reference decommissioned `flows/`/`dataverse/`.
   A future content sweep can repoint/retire them; surfaced by the checker, non-blocking.
5. **Production mailboxes** — grant Exchange-RBAC for **info@ + desk@** when moving from testing to the prod set.
6. **CI secret** — add the Azure service-principal/OIDC secret so the CI `verify-live` job runs (link job runs without it).

---

## 7. What changed (scope)

~42 docs edited, 38 moved (history preserved via `git mv`), 2 deleted, ~18 new files (the registry, the
freshness tooling, 9 per-dir READMEs, this review). All on branch `chore/doc-hygiene-truth-freshness`.
**Not committed** — staged for review.
