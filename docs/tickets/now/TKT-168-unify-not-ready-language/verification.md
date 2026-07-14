# Verification — TKT-168: Make Not Ready status language agree with the queue

## Verdict
TESTED (offline) — implementation, full tests and production build pass; deployment and independent live verification remain required.

## Required evidence
- Focused and full SPA tests plus production build.
- Rendered-copy proof for shared status badges, Not Ready reasons and filters.
- Signed-in live Chrome proof on the Not Ready queue and one affected case detail after deployment.

## Offline evidence — 2026-07-13
- Focused rendered status and shared-reason tests: PASS.
- Domain: 1,132 tests PASS; SPA: 469 tests PASS.
- Domain and production SPA builds: PASS.

## Follow-up verdict — 2026-07-13

PENDING for the expanded acceptance. Prior copy tests remain valid, but a specific blocker/multi-blocker
matrix and signed-in live proof are still required before the generic label replacement is complete.

## Independent verification update — 2026-07-14

### Verdict

FAILED

The narrow first-pass replacement is deployed, but the superseding expanded acceptance is not
implemented. Production directly contradicts it: **Not ready is still used as a reason**, concrete
blockers collapse into a generic row/detail state, and the single-valued reason model cannot support
overlapping blocker discovery/filtering.

### Evidence

- Acceptance 27 — signed-in `/queue/not-ready` showed queue/tab `Not ready (435)`, reason chip `Not
  ready (21)`, row status `Not ready`, and no case-status/reason/filter occurrence of exact phrase
  `Needs review`. Field-level provenance wording remains, as acceptance 31 requires. Row action is the
  generic `Review case & confirm readiness`.
- Acceptance 28 — shared `StatusBadge` maps stored `needs_review` to `Not ready`; queue rows and case
  WG63ZTO/QDOS26085 both rendered it. List and detail consume the shared badge.
- Acceptance 29 — `Missing fields`, `Missing images`, `Duplicate risk`, and `Error` remain in source
  and tests. A signed-in live sample for every specific blocker was unavailable.
- Acceptance 30 — source defines Review as `ready_for_eva` only. Chrome showed a distinct Review queue
  with 22 cases, but its list does not expose raw readiness, so the snapshot alone cannot prove every
  member.
- Acceptance 31 — preserved: WG63ZTO detail still renders field-level source/review states such as
  `From saved records — Needs review`, `From the email — Needs review`, and `No review required`.
- Acceptance 32 — reason counts/filter operate on one `c.actionReason`; label mapping corrects
  `needs_review` to `Not ready`. A single-valued facet cannot retain multiple blockers.
- Acceptance 33 — failed: current component coverage tests the generic and four status labels only.
  There is no shared queue/detail reason-summary, count/filter interaction, combined-blocker,
  accessible-name or contradiction-prevention matrix.
- Acceptance 34 — failed as a complete live criterion. Chrome proves the narrow replacement but also
  the expanded failure; only counts (`Not ready 435`, `Review 22`, `Held 140`) were observable.
- Acceptance 35 — directly failed live: `Filter by reason` contains `Not ready (21)`, using workflow
  state as the reason.
- Acceptances 36–37 — directly failed live: sampled rows, including WG63ZTO, show only status `Not
  ready` and action `Review case & confirm readiness`. Its detail exposes five concrete blockers:
  incident date, instruction date, overview/registration plus close-up images, vehicle details needing
  attention, and unresolved field reviews. Header still shows only `Not ready`.
- Acceptance 38 — failed: detail Readiness exposes blockers, but queue has no deterministic
  multi-blocker summary; reason copy switches on one `actionReason` and falls back to generic text.
- Acceptance 39 — structurally failed: case type stores at most one `actionReason`; facet count/filter
  uses that value and exact equality. A field+image case cannot be a member of both filters.
- Required validation matrix is absent: no automated/live matrix covers generic plus every blocker
  across queue, badge, detail, filter and accessible name, including combined blockers.

### Pending / gaps

- Separate the `Not ready` state from blocker reasons; omit it from the reason facet when a concrete
  blocker exists.
- Derive one ordered blocker set and use it for row summary, detail reason, facet membership/counts and
  accessible labels. Keep generic fallback only for a truly blocker-less incomplete case.
- Support many-to-many combined-blocker filter membership without erasing other blockers.
- Add the complete automated matrix, deploy it, and capture signed-in generic/specific/combined cases
  plus before/after Review membership.

### How to re-verify

1. Confirm canonical derivation returns an ordered blocker set, not one `actionReason`.
2. Run unit/component coverage for single/combined blockers, queue/detail parity, facet membership,
   accessible names and prohibited contradictory phrasing.
3. Deploy and verify in signed-in `/queue/not-ready`: state remains `Not ready`, reason chips are
   concrete, rows/details show the most specific deterministic summary, and a combined case remains
   discoverable under every applicable filter.
4. Prove generic fallback appears only on a genuinely blocker-less case.
5. Prove field provenance/stored codes and the Review member set remain unchanged.

### Confidence + unread surfaces

**High confidence.** Complete ticket/evidence/screenshots and current badge, queue, detail, type,
reason, routing and tests were inspected, plus fresh signed-in read-only Not-ready/detail/Review views.
PostgreSQL/API payloads, all 435 Not-ready cases and a full live blocker matrix were unread, but cannot
overturn the directly observed expanded-acceptance failures.
