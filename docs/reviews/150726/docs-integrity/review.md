# Lane B — Docs integrity & governance

**Scope:** the documentation slim (main `docs/` ~24 trees → branch 9). **Verdict:** migrations are mostly a
sound remap (removed trees migrated or intentionally dropped-and-recoverable), but the reset **violates the
stated precedence rule** by editing binding-review and ADR content that outrank it. `check:docs` passing is
misleading — inbound references were scrubbed in lockstep, so nothing dangles even though content was removed.
4 issues + verified-clean migrations.

### B1 — [HIGH · CONFIRMED] Binding review `190626/` gutted — 33 annotated screenshots deleted, prose halved
Repo-wide PNGs drop 180→115; every one of the 33 `docs/reviews/190626/**` review images
(`dashboardannotated`, `caseview-1..7`, `evacreation step1-8`, `corpus-admin`, …) is deleted and
`overview.md`/`checklist.md`/area `review.md` were edited to remove the embeds (so no link dangles).
`checklist.md` 204→106 lines; `overview.md` fully rewritten. Per the precedence chain a binding review is
"superseded only by a later review," not by a structural reset. *Consequence:* the authoritative annotated
evidence of a binding review is destroyed from the live tree. *Mitigant:* git-recoverable; much is point-in-time
prior-platform UI now superseded by the live SPA. **Recommend:** restore the folder untouched, or add a later
dated review that explicitly supersedes it.

### B2 — [HIGH · CONFIRMED] All 25 ADRs rewritten/compressed; substantive decisions dropped
`docs/adr/*`. ADR-0013 lost its entire **2026-07-08 provider-policy image-based-prefill amendment** (TKT-109/129,
with the QDOS/PCH/AX/SBL corpus evidence) and its supersession record of the 190626 "address-match LIVE" line
(104→22 lines). ADR-0006 was re-slugged (`enrichment-rest-wrapper-dvsa-m1` → `vehicle-enrichment-service-boundary`)
and generalised, dropping the M1/M3 phasing + concrete operations; ADR-0009 likewise re-slugged. ADRs outrank the
reset. *Consequence:* branch ADR-0013 no longer teaches that `always_image_based` providers auto-fill — that
now survives only in ticket folders (below ADRs in precedence). *Mitigant:* recoverable from tickets + git; some
dropped text was stale retired-platform-era framing.

### B3 — [MEDIUM · CONFIRMED] Curated operator-blocker registry (`gated.md`) replaced by a generated table
`docs/gated.md` → `docs/operations/operator-actions.md`. The hand-maintained registry (dated go-live narrative
D9/D10 applied-live, B4 in progress; per-item "what/why-only-you/steps"; the banded prior-platform backlog)
became a machine-generated table keyed off blocked-ticket frontmatter. The A1/B4/C1/D-item identifiers + the
applied-live audit trail are gone, and cross-refs like "per gated.md A1" no longer resolve to an anchor.
*Mitigant:* underlying blockers persist as `tickets/blocked/*`; git-recoverable.

### B4 — [LOW–MEDIUM · CONFIRMED-intentional] `CLAUDE.md` gutted 351→15 lines to a thin adapter
Domain model, integration/gating, Azure anti-churn routing, related-repos, agent roster removed; it now points
only to AGENTS.md/CONTEXT.md/docs/README.md/LIVE_FACTS.json. **No dangling links** (grep for
ROADMAP/CURRENT_STATUS/docs/gated/HISTORICAL/plans/requirements/azure = 0 hits repo-wide) and the domain model
**did land** in `docs/product/case-and-evidence.md` (verified adequate). Flagged only because CLAUDE.md is the
agent entry-point and now carries no gate names/Azure routing — those rely on `operations/` + LIVE_FACTS being
found via `docs/README.md`. Largely intentional de-duplication.

### Verified clean (non-findings)
- `docs/HISTORICAL/` removed entirely — explicit branch policy ("no in-tree archive"), git-recoverable. **Legit.**
- `docs/requirements/` → `docs/product/` — domain specs migrated (case-and-evidence, intake-workflow,
  provider-and-address-corpora, company-and-scope, roles-and-permissions). Clean.
- `docs/MAINTENANCE.md` → `docs/governance/documentation.md` — precedence hierarchy + live-number single-source
  protocol both preserved. Adequate.
- `docs/architecture/live-environment.md` → `docs/operations/live-environment.md`; `LIVE_FACTS.json` retained at
  root as sole registry; **no live-number leakage** found (#3 sound).
- `docs/azure/`, `runbooks/`, `activation/`, `research/`, `_audit/`, `handoff/`, `reconciliation/`, `repository/`,
  `open-questions.md`, `not-yet-live-inventory.md` — consolidated into `operations/`+`governance/` or dropped as
  stale (high-value playbooks represented).

**Bottom line:** no *silently-lost-and-still-needed* prose found in the migrated trees; the real defects are the
**precedence violations** (editing binding reviews + rewriting ADRs), all git-recoverable but leaving the live
authoritative surface saying less than the binding originals.
