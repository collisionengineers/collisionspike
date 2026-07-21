---
id: PLAN-016
title: Inbound-email triage — rebuild the taxonomy and precedence engine
status: active
tickets: [TKT-310, TKT-311, TKT-312, TKT-313, TKT-314, TKT-315]
depends-on: []
plan-kind: feature
---

# PLAN-016 — Inbound-email triage rebuild: rules and taxonomy

## Outcome

Replace the flat nine-category inbound-email taxonomy and its first-match-wins, order-accreted
rule engine (email_classifier.py, 20 rules `0a` through `6`, one shared 8-way `suppress_as_query`
disjunct) with a two-axis taxonomy (`stage` × `intent`) and a scored-evidence precedence engine
ranked by acquisition cost and spoofability (CONTENT > IDENTITY > TEXT > SHAPE). Content typing —
the most expensive, least-spoofable signal, produced by actually opening the document — is
currently consulted LAST and can be vetoed by a filename regex; that ordering must not be
expressible in the new design.

Trigger incident: a staff-forwarded QDOS instruction classified `query`/`query_existing_work` via
`rule:report_with_reference` and never minted a Case (2026-07-21 18:16Z, `desk@collisionengineers.co.uk`,
`(EREF9) RTA on 19/07/2026`, Our Ref `REB/ND/47023/1`). A case appeared anyway only because the
ADR-0022 retro fallback reconstructed one from Box — see TKT-303/TKT-304/TKT-308, the independent
P0 defects shipped ahead of this rewrite and not gated on it.

## Operator decisions (2026-07-21, binding for this plan)

- Full rewrite including the taxonomy — no interim minting patch. Alpha email testing pauses
  until this lands.
- Staff forwards AND direct provider mail are both permanent first-class routes.
- EVA image rules become advisory, not blocking (shipped independently as TKT-309 — already
  landed, not part of this plan's scope).
- Retro fallback is off for the alpha (TKT-308 — live config, already ticketed).
- Engine consolidation (the vendored triplication + hand-written TS/Python twins) stays in scope
  as Phase 5, closed with an ADR — hard-to-reverse, so it gets one.

## Phases (each its own ticket + PR, smallest safe unit first)

| Phase | Ticket | Scope |
|---|---|---|
| 0 | TKT-310 | Ground truth: regenerate the v4 eval baseline, sort the 130 unsorted `.eml` corpus (human review, the long pole), add the QDOS forward as a ground-truthed manifest item. |
| 1 | TKT-311 | Taxonomy as two axes (`stage` × `intent`); `categoryMintsCase` becomes a formula, not a hand-maintained list; v4→v5 label projection. |
| 2 | TKT-312 | Signal-precedence evaluator (CONTENT/IDENTITY/TEXT/SHAPE ranked, not source-line ordered); regression gate for every current suppressor + the provider-none promotion fall-through. |
| 3 | TKT-313 | Forwards as a first-class route: classify the embedded original's sender/subject/body; the forwarder is provenance only. |
| 4 | TKT-314 | Migration of every touchpoint (code tables, codecs/dto, DB baseline + delta migration, code-table-parity, runtime-contract snapshot, SPA, Data API, orchestration, `run_ab.py`); back-fill the 2 surviving `inbound_email` rows. |
| 5 | TKT-315 | Collapse the vendored triplication + TS/Python twins to one installable package the orchestrator calls; record an ADR for the single-package decision. |

## Sequencing

Phase 0 is the hard gate: nothing in Phases 1+ starts until the sorted corpus and v4 baseline
exist — human review of ~50 leaf folders (6% populated today) is the long pole and the
highest-value input to every later phase. Phase 1 (taxonomy) and Phase 2 (precedence engine) are
co-designed but land as separate tickets/PRs. Phase 3 (forwards) is input normalisation under
Phase 2's model, not a new rule, and can follow immediately. Phase 4 (migration) moves every
touchpoint together — partial migration is not safe (dual taxonomy readers). Phase 5 (engine
consolidation) is independently schedulable once Phase 4 ships; it is hard-to-reverse and gets
its own ADR before execution.

## Invariants (do not regress)

- Dark gates / suggest-first triage doctrine (ADR-0019); env only inside activities.
- Stage A category drives mint; Stage B only short-circuits via explicit arms.
- VRM-only never auto-attaches (ADR-0010).
- The vendored parser stays vendored (ADR-0018); Phase 5 changes packaging, not the
  no-in-tree-rewrite doctrine.
- Every current suppressor's protected BEHAVIOUR survives (as a passing eval item) before its
  RULE (the source-line disjunct) is deleted — the disjuncts go, not the behaviours.

## Verification / acceptance (plan-level, refined per ticket)

- A/B (`run_ab.py` / `run_ab_parsefed.py`) vs `baseline-v4.json`, judged per-category
  precision/recall, not aggregate accuracy. Ship only when the rewrite matches or beats v4 AND
  clears the named misses (including the QDOS forward, ground-truthed `new_work`/`instruction`).
- Every retired suppressor + the provider-none promotion fall-through has a passing eval item.
- `code-table-parity.mjs`, `check-engine-materialized.py`, and `verify-all.mjs` green throughout;
  `npm run generate:governance` run before each commit.
- Live watch after deploy: zero `boxFolderCreate` 4xx retries (already covered by TKT-303, not
  this plan); `extractImages` duration back under the durable activity timeout.

## Related ADR

Phase 5 records a new ADR for the single-package engine decision. Number to be confirmed at
filing time, once Phase 5 starts.

<!-- GENERATED:PROGRESS -->
## Computed progress

**0/6 done (0%).**

| Status | Count |
|---|---:|
| Now | 0 |
| Verify | 0 |
| Done | 0 |
| Next | 1 |
| Backlog | 5 |
| Blocked | 0 |

| Ticket | Status | Title |
|---|---|---|
| [TKT-310](../next/TKT-310-inbound-triage-ground-truth-corpus/TKT-310-inbound-triage-ground-truth-corpus.md) | next | Inbound-triage rewrite Phase 0 — regenerate the v4 baseline and sort the eval corpus |
| [TKT-311](../backlog/TKT-311-inbound-triage-two-axis-taxonomy/TKT-311-inbound-triage-two-axis-taxonomy.md) | backlog | Inbound-triage rewrite Phase 1 — taxonomy as two axes (stage x intent) |
| [TKT-312](../backlog/TKT-312-inbound-triage-signal-precedence-engine/TKT-312-inbound-triage-signal-precedence-engine.md) | backlog | Inbound-triage rewrite Phase 2 — signal-precedence evaluator replaces first-match-wins |
| [TKT-313](../backlog/TKT-313-inbound-triage-forwards-first-class-route/TKT-313-inbound-triage-forwards-first-class-route.md) | backlog | Inbound-triage rewrite Phase 3 — forwards as a first-class route |
| [TKT-314](../backlog/TKT-314-inbound-triage-taxonomy-migration/TKT-314-inbound-triage-taxonomy-migration.md) | backlog | Inbound-triage rewrite Phase 4 — migrate every taxonomy touchpoint together |
| [TKT-315](../backlog/TKT-315-inbound-triage-engine-consolidation/TKT-315-inbound-triage-engine-consolidation.md) | backlog | Inbound-triage rewrite Phase 5 — collapse the vendored triplication and TS/Python twins |
<!-- /GENERATED:PROGRESS -->
