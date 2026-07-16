# TKT-150 future remediation safety contract

This is a requirements checklist, not an executable runbook. The previous one-time remediation executable
and package command were removed during repository cleanup. No command in the current tree is authorized to
apply claimant repairs.

## Preconditions for any future implementation

1. Fix the raw-source binding defect and generate a new read-only plan from current data.
2. Prove every candidate binds to immutable message/document bytes and a specific pre-run case version.
3. Classify every baseline case as repair, absent in source, conflicting or failed; omissions fail the plan.
4. Re-run the independent audit and require zero unexplained bindings, duplicates or source substitutions.
5. Freeze the ordered plan bytes and SHA-256.
6. Take a plan-bound database backup, hash its actual bytes and prove restoration on a non-production copy.
7. Review a newly implemented apply tool as ordinary source. It must be claimant-only, fill-only,
   idempotent, version-checked and unable to widen provider, status, Archive or EVA scope.
8. Bind named approval to the exact plan, backup, tool revision, environment identity, case allowlist and
   before-value hash. Any change invalidates approval.

## Apply requirements

- Repository work alone never authorizes the apply.
- Each candidate is re-read before mutation; changed source, case version, staff value or allowlist fails
  closed for that row.
- Claimant and source record are written atomically. Existing staff values are never overwritten.
- Every attempted row receives a durable outcome with before/after value, source hash, reason and error.
- Interruption and replay cannot duplicate a write or turn a failed row into an unrecorded omission.

## Post-run evidence

- Account for the entire frozen baseline as repaired, source absent, conflicting or failed.
- Independently sample every outcome class against retained source bytes and current case state.
- Confirm repaired cases re-evaluate readiness through normal behavior; do not force queue state.
- Retain plan, approval, backup, restore proof, tool revision, journal and residual ledger hashes.

Until all requirements are met in one separately authorized window, TKT-150 remains `now` and no apply is
permitted.
