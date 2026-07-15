# Verification — TKT-150

## Verdict

PENDING. Runtime changes have offline and deployed-source evidence, but remediation acceptance is not met.

## Evidence

- [Offline root-cause record](./evidence/offline-root-cause-2026-07-12.md) captures observed failure
  families and negative controls.
- [Dated census](./evidence/live-census-2026-07-12.md) records the read-only affected cohort.
- [Candidate-plan summary](./evidence/remediation-plan-summary-2026-07-13.md) records the superseded plan
  identity and why it cannot be applied.
- The latest read-only audit found unresolved raw-source binding and a continuing QDOS26079 source failure.
- No current backup, approval, apply journal or complete residual ledger exists.

## Pending

Fix source binding, reproduce every observed family, generate and independently audit a new plan, take and
restore-test a plan-bound backup, obtain named approval, implement/review a new claimant-only apply tool,
then account for every baseline case and verify fresh natural extraction per repaired family.

## How to re-verify

Follow [the future remediation safety contract](./remediation-runbook.md). Keep this ticket `now` until the
new read-only plan passes audit; never infer approval from the removed executable or an older plan hash.
