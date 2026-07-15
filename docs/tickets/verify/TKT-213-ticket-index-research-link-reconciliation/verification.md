# Verification — TKT-213: Reconcile tickets, indexes, plans and research links

## Verdict
TESTED (offline)

## Evidence
- Ticket generation reports 207 tickets and six plans.
- Each ticket id appears once in a status folder, plan membership is bidirectional, and PLAN-006 has
  exactly TKT-020 plus TKT-207 through TKT-215. PLAN-004 includes TKT-216.
- BOARD, ticket README/index, plan progress and operator-actions output are generated from specs.
- Ticket validation reports zero status, artifact, membership, research-link, evaluation-manifest or
  generated-view failures.
- Documentation validation reports zero broken links, orphan canonical pages or authority leakage; no
  known-absent backlog is tolerated.
- All ten PLAN-006 tickets are in `verify`; their specifications, folders and generated views agree.

## Pending / gaps
- Regenerate views after any later verifier-owned status move.
- Remote CI and independent samples of moved research/evaluation references remain pending.

## How to re-verify
Run node scripts/maintenance/ticket-generate.mjs, npm run check:tickets and npm run check:docs from the
final checkout. Require 207 tickets and six plans, then rerun after any status move and
independently sample each repaired research and evaluation reference.
