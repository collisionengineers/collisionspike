# Changes — TKT-031: Client report-chaser misrouted to 'Other'

## Status
done — VERIFIED-LIVE 2026-07-09: the ticket's own sample .eml POSTed to the deployed parser
`POST /api/classify-email` returned 200 `query`/`query_existing_work` at 0.8 (`rule:query_with_reference`),
closing the live-probe gap the prior state flagged. See [verification.md](./verification.md) § Verdict update — 2026-07-09.

> **Prior state (superseded 2026-07-09):** now — passes in the committed eval corpus (2026-07-02); not yet
> confirmed via a live occurrence/probe.

## Commits
- No code change required — the deterministic classifier's existing-job chase rule already routes this
  sample to `query`/`query_existing_work`, not 'Other'.
- 2026-07-02 — rules-engine-v2 Phase 1 eval pass: scored correctly in the committed real-email eval
  harness (manifest id `tkt031-client-chaser`, `scripts/eval-email/`) — this is a **corpus** pass (the
  vendored engine called directly as a Python function), not yet a live HTTP probe against the deployed
  `/classify-email` route or a fresh real inbound occurrence. See [verification.md](./verification.md).

## Summary
Part of the email-classification cluster (relates TKT-006). A client chasing a report on an existing job fell into the "Other" bucket; the classifier needs to route existing-job chases to the query category instead.
