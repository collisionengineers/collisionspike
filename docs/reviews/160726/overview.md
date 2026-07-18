# Review 160726 — ADR consistency review and rewrite (16 July 2026)

The operator read all 25 ADRs on 2026-07-16 and left substantive comments on roughly seventeen of
them. This folder is the binding record of that review: the comments, the rulings that resolved each
contradiction between the ADR corpus and the plans, tickets, and code, and the reconciliation state of
the rewrite that followed.

## Method

Three exploration sweeps gathered code and ticket ground truth for every commented claim; a plan agent
designed the execution; the operator answered four scoping questions and, in a second-opinion session
the same day, endorsed the plan with additions and four further rulings. The full working plan is
`workingspace/adr-rewrite.txt` (user-owned). A moved-base reconciliation was folded on 2026-07-17
(operator-approved) after TKT-219 merged to main mid-cycle.

## File roles

- [`review.md`](./review.md) — the operator's comments, transcribed per ADR with
  directive/question/observation tags.
- [`decisions.md`](./decisions.md) — the ruling register D1–D17 plus the answered scoping questions
  and the rulings resolved without asking.
- [`checklist.md`](./checklist.md) — reconciliation table, minted follow-up tickets, TKT-206 riders,
  and verification state.

## Relation to Review 150726

150726's finding M3 established that ADRs and binding reviews outrank a structural reset and that
ADR-0013's 2026-07-08 image-based pre-fill amendment must survive in meaning. This review honours that
precedence: the 0013 rewrite preserves the amendment in full, and every superseding rewrite carries
dated provenance back to this folder.

## State

ADR rewrites, index and glossary updates, and follow-up ticket minting executed 2026-07-17 on branch
`docs/adr-review-160726`. Verification state is tracked in [`checklist.md`](./checklist.md).
ADR-0022 was amended directly by the operator on 2026-07-16 (merged with TKT-219) and is deliberately
untouched by the rewrite.
