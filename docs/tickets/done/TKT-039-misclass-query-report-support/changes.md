# Changes — TKT-039: Report-support request misclassified as new case
## Status
done — VERIFIED-LIVE 2026-07-09: the sample .eml (with the EngineersReport-V1.pdf attachment context) POSTed
to the deployed classify route returned 200 `query`/`query_existing_work` (`rule:query_with_reference`),
closing the live-probe gap the prior state flagged. See [verification.md](./verification.md) § Verdict update — 2026-07-09.

> **Prior state (superseded 2026-07-09):** now — passes in the committed eval corpus (2026-07-02); not yet
> confirmed via a live occurrence/probe.
## Commits
- No code change required — the deterministic classifier's existing-report/support-request rule already
  routes this sample to `query`/`query_existing_work`, not a new case.
- 2026-07-02 — rules-engine-v2 Phase 1 eval pass: scored correctly in the committed real-email eval
  harness (manifest id `tkt039-report-support`, `scripts/evaluation/email/`) — this is a **corpus** pass (the
  vendored engine called directly as a Python function), not yet a live HTTP probe against the deployed
  `/classify-email` route or a fresh real inbound occurrence. See [verification.md](./verification.md).
## Summary
A query asking us to provide arguments supporting an existing report (with that report attached) was
classified as a new case; the classifier needs to treat existing-report/Our-Ref support requests as queries.
Part of the email-classification cluster (relates TKT-006).
