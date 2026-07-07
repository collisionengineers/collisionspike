# Changes — TKT-033: Simple reply to our query misclassified as new work

## Status
done — live-probed against the deployed engine 2026-07-02; locked in as an eval-corpus regression pin.

## Commits
- No code change required — the same `query`/`query_existing_work` reply rule that fixes TKT-030 (same
  thread/file) already covers this sample.
- 2026-07-02 — rules-engine-v2 Phase 0/1 evidence pass: live-probed the evidence email against the
  deployed `/classify-email` route; result recorded as an eval-corpus regression pin (manifest id
  `tkt033-reply-existing-query`, `scripts/eval-email/`). See [verification.md](./verification.md).

## Summary
Part of the email-classification cluster (relates TKT-006). A short reply to a query we sent was misclassified as new work; shares the thread-scoping root cause with TKT-030 (classify the newest received segment, not the quoted chain).
