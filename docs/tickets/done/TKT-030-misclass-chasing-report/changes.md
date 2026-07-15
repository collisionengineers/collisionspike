# Changes — TKT-030: Report-chaser misclassified as new work

## Status
done — live-probed against the deployed engine 2026-07-02; locked in as an eval-corpus regression pin.

## Commits
- No code change required — the deterministic classifier's reply/chase rule (`query`/`query_existing_work`)
  already outranked the buried-instruction text in the quoted chain for this sample.
- 2026-07-02 — rules-engine-v2 Phase 0/1 evidence pass: live-probed the evidence email against the
  deployed `/classify-email` route; result recorded as an eval-corpus regression pin (manifest id
  `tkt030-chaser`, `scripts/evaluation/email/`). See [verification.md](./verification.md).

## Summary
Part of the email-classification cluster (relates TKT-006). A report-chaser on an existing job was classed as new work; suspected root cause is the classifier scanning the entire email chain rather than the specific received message — the thread-scoping fix is shared with TKT-033.
