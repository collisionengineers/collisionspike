# Changes — TKT-031: Client report-chaser misrouted to 'Other'

## Status
now — passes in the committed eval corpus (2026-07-02); not yet confirmed via a live occurrence/probe.

## Commits
- No code change required — the deterministic classifier's existing-job chase rule already routes this
  sample to `query`/`query_existing_work`, not 'Other'.
- 2026-07-02 — rules-engine-v2 Phase 1 eval pass: scored correctly in the committed real-email eval
  harness (manifest id `tkt031-client-chaser`, `scripts/eval-email/`) — this is a **corpus** pass (the
  vendored engine called directly as a Python function), not yet a live HTTP probe against the deployed
  `/classify-email` route or a fresh real inbound occurrence. See [verification.md](./verification.md).

## Summary
Part of the email-classification cluster (relates TKT-006). A client chasing a report on an existing job fell into the "Other" bucket; the classifier needs to route existing-job chases to the query category instead.
