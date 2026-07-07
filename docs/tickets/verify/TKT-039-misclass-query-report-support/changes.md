# Changes — TKT-039: Report-support request misclassified as new case
## Status
now — passes in the committed eval corpus (2026-07-02); not yet confirmed via a live occurrence/probe.
## Commits
- No code change required — the deterministic classifier's existing-report/support-request rule already
  routes this sample to `query`/`query_existing_work`, not a new case.
- 2026-07-02 — rules-engine-v2 Phase 1 eval pass: scored correctly in the committed real-email eval
  harness (manifest id `tkt039-report-support`, `scripts/eval-email/`) — this is a **corpus** pass (the
  vendored engine called directly as a Python function), not yet a live HTTP probe against the deployed
  `/classify-email` route or a fresh real inbound occurrence. See [verification.md](./verification.md).
## Summary
A query asking us to provide arguments supporting an existing report (with that report attached) was
classified as a new case; the classifier needs to treat existing-report/Our-Ref support requests as queries.
Part of the email-classification cluster (relates TKT-006).
