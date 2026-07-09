---
id: TKT-041
title: Cancelled/closed-case emails have no home (no cancellation concept)
status: done
priority: P2
area: email
tickets-it-relates-to: [TKT-023, TKT-046]
research-link: docs/plans/rules_engine_v2_plan_9ba034c4.plan.md
---

# Cancelled/closed-case emails have no home (no cancellation concept)

## Problem

Providers email us when a claim/case is **cancelled or closed** (e.g. subject
`Claim Cancelled - SBL-B0649696`). The classifier has **no cancellation concept**, so these land
`other/other` at abstain confidence and nothing connects them to the case they cancel. Staff have to
spot them in the Other pile and act manually.

## Wanted

A `cancellation` triage category (taxonomy v2): match the email to its open case by ref/job-ref, then
**propose** a close/hold with a note + audit trail — **staff-confirmed, never an automatic close**
(the terminal case status `removed` already exists). Unmatched cancellations surface for review.

## Evidence

- `source-emails/` — 13 real `.eml` samples (a mix of cancellation, closure, instruction and
  estimate mails — useful as both positives and near-miss negatives for the eval corpus).

## Delivery

Phase 2 of the [Rules Engine v2 plan](../../../plans/rules_engine_v2_plan_9ba034c4.plan.md) (taxonomy v2
+ triage policy). The old `TKT-041-merge-fix` note that shared this id was split out to
[TKT-052](../../verify/TKT-052-merge-provider-loss/TKT-052-merge-provider-loss.md).

## Status update — 2026-07-02 (next — built + eval-proven; needs D7 + the parser deploy)

Built: the `cancellation` category ships in the taxonomy-v2 DDL delta (`84fb102`, operator-gated —
[docs/gated.md](../../../gated.md) §D7) and the re-cut parser engine (`ec45970`, engine-v2.3, cancellation +
`case_update` rules); the propose-close/hold action (never auto-close) rides the same triage-policy +
`ai_suggestion` machinery as TKT-023 (`7bac2ee`/`00980d5`/`9fb16cf`), with a cancellation banner + "Open
case" affordance in the SPA (`69ec02e`). **Eval-proven**: 12/13 of this ticket's own 13-email corpus score
correctly as `cancellation` in the committed harness (`category_correct`/`subtype_correct` both `true`,
100% recall on the 12 true-cancellation samples — [baseline-v2.json](../../../../scripts/eval-email/baseline-v2.json)).

**Flagged taxonomy gap (operator decision needed):** the 13th sample (`tkt041-06-hold-request`) is a
**hold**, not a cancellation — a sender asking us to pause work on a specific job until further notice,
case explicitly stays open. The plan does not define a `hold` category/subtype distinct from
`cancellation`; the eval harness deliberately does not invent one (it scores that item as `query` in both
v1 and v2, not as a taxonomy miss) — see the manifest's own rationale for `tkt041-06-hold-request` in
[scripts/eval-email/manifest.json](../../../../scripts/eval-email/manifest.json). This is a genuine gap for
the operator to decide, not something built or guessed at in this pass.

**Not yet active:** the `cancellation` category and the engine that emits it are both gated — 🔒 D7 (DDL
delta apply) must land before the taxonomy-v2 parser deploy, and no live probe has run yet against a real
inbound cancellation email on the deployed (v1-only) engine.

## Verification

- [verification.md](./verification.md) — VERIFIED-LIVE 2026-07-09 (ticket-verifier dispatch, classify layer).
