---
id: TKT-041
title: Cancelled/closed-case emails have no home (no cancellation concept)
status: now
priority: P1
area: email
tickets-it-relates-to: [TKT-023, TKT-046, TKT-093, TKT-097, TKT-130]
research-link: docs/tickets/now/TKT-041-cancelled-case/evidence/followup-2026-07-13/info.md
plan: PLAN-004
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

- `source-emails/cancelled-cases/` — 13 real `.eml` samples (a mix of cancellation, closure, instruction
  and estimate mails — useful as both positives and near-miss negatives for the eval corpus). They stay at
  this path because the eval harness references them by exact path in `scripts/eval-email/manifest.json`;
  the `evidence/` pointer to them is [evidence/README.md](./evidence/README.md).

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

**Now active (updated 2026-07-09):** D7 (the taxonomy-v2 DDL delta) landed, the taxonomy-v2 parser is
deployed, and `TRIAGE_CANCELLATION_ENABLED=true` on `cespk-orch-dev`. A live probe has run: the real sample
`Claim Cancelled - SBL-B0649696` classified 200 `cancellation`/`cancellation_notice` at taxonomy_version 2.
The propose-close/hold action remains staff-confirmed (never an automatic close). See
[changes.md](./changes.md) and [verification.md](./verification.md).

> **Prior state (superseded 2026-07-09):** Not yet active — the `cancellation` category and the engine that
> emits it are both gated — 🔒 D7 (DDL delta apply) must land before the taxonomy-v2 parser deploy, and no
> live probe has run yet against a real inbound cancellation email on the deployed (v1-only) engine.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md) — VERIFIED-LIVE 2026-07-09 (ticket-verifier dispatch, classify layer).
- [Evidence](./evidence/README.md) — the 13 `.eml` samples (kept under `source-emails/cancelled-cases/`).

## Reopened ruling — 2026-07-13

The earlier propose-only behavior is superseded. A definite cancellation with one unambiguous eligible
case target must attach to that case and move it to **Held** automatically. It must never mark the case
complete, removed or closed. A cancellation is itself a submission blocker until a handler makes a later,
explicit case decision.

“Ambiguous” is not a catch-all for low confidence. It means at least one of these concrete conditions is
present:

- no eligible active case matches the supplied identifiers;
- more than one eligible active case matches (including a VRM shared by separate active accidents);
- Case/PO, provider reference, registration or claimant signals point to different cases;
- the only match is merged, removed, completed or otherwise ineligible for an automatic state change; or
- the message is not clearly a cancellation rather than a pause request, query or ordinary closure update.

### Acceptance

- A definite cancellation containing an exact Case/PO or provider reference that resolves to exactly one
  eligible active case is attached idempotently and that case moves to Held in the same durable operation.
- The cancellation creates a visible, specific hold reason and an audit entry identifying the message,
  previous state, new state and matching evidence; EVA submission rejects the case even if a stale client
  still presents an export action.
- Cancellation handling never moves a case to completed, removed or any other terminal state.
- Every deferred cancellation records and displays one of the concrete ambiguity reasons above. It does
  not mutate any candidate case before a handler selects the target.
- After a handler resolves an ambiguous target, the email attaches once and the selected case moves to
  Held immediately; replay, duplicate notifications and retries do not duplicate links, holds or audits.
- A VRM-only message may auto-attach only when the VRM identifies exactly one eligible active accident.
  Two active cases for the same vehicle remain ambiguous even if their registration text is identical.
- Near-miss fixtures distinguish cancellation notices from pause/hold requests, queries, acknowledgements
  and completed-work messages without reducing recall on the existing cancellation corpus.

### Validation

- Unit and integration tests cover every ambiguity reason, exact-single auto-Hold, handler resolution,
  idempotent replay, stale state, concurrent state change and submission fail-closed behavior.
- The existing 13-message corpus plus the supplied follow-up note is replayed with an explicit expected
  category, target decision and state transition for every item.
- Signed-in live verification uses only genuine operator-designated cancellation work to prove the inbox
  attachment, Held queue, visible reason, audit row and server-side EVA refusal. A naturally occurring
  same-VRM multi-case counterexample proves the ambiguous path when available; otherwise that live row
  stays PENDING and the shape is proved in isolation. No live case or email is created solely for proof.

### Follow-up evidence

- [Operator cancellation and ambiguity note](./evidence/followup-2026-07-13/info.md)
