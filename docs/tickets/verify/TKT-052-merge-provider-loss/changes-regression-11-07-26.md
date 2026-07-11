# Regression follow-up — 11 July 2026

## Why this ticket reopened

PR 55's merge implementation made the core move atomic, but a second adversarial review found two remaining functional gaps:

- valid uppercase UUID input was compared with lowercase UUID text returned by Postgres, so the source provider could be missed during carry-over;
- readiness recomputation still happened after the merge transaction without a durable generation request, allowing a committed merge to be reported as failed or leave stale readiness if the immediate recompute failed.

## Required correction

- Validate and canonicalise both case IDs once before self-merge checks, locks, queries, provider matching, and the response.
- Request the target case's durable status recomputation in the merge transaction and treat the immediate evaluation as an optional fast path.
- Preserve the existing cross-provider refusal and verified merge-lineage locking.

## Verification target

- Mixed-case UUID input still carries the source provider into a providerless survivor.
- The same UUID in different casing is rejected as a self-merge.
- A forced post-commit evaluation failure leaves a drainable status generation and does not turn the completed merge into a false failure.

## Implementation

- Merge/backfill use the same ordered advisory and row-lock protocol, so a stale backfill cannot land
  on a retired source (`e22b4a1`).
- Case ids are validated and canonicalised before self-checks, provider selection, locks and response
  construction.
- The survivor's status generation is requested in the merge transaction; the immediate recompute is
  an optional fast path and acknowledges only the evaluated generation (`057f7a0`).
- Merge-candidate eligibility now matches the execution guard: one providerless side is offered so
  the safe carry-over path is reachable from the staff dialog, while two known, different providers
  remain excluded. The dialog copy states the same rule and the route regression pins both branches.
