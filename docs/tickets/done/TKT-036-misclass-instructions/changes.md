# Changes — TKT-036: Work-instructions email misclassified as query
## Status
done — live-probed against the deployed engine 2026-07-02; locked in as an eval-corpus regression pin.
## Commits
- No code change required — the deterministic classifier already treats the "New eng ins" subject +
  instructions attachment as `receiving_work`/`new_client_work`, not a query.
- 2026-07-02 — rules-engine-v2 Phase 0/1 evidence pass: live-probed the evidence email against the
  deployed `/classify-email` route; result recorded as an eval-corpus regression pin (manifest id
  `tkt036-instructions-misclass`, `scripts/evaluation/email/`). See [verification.md](./verification.md).
## Summary
An instructions email (with a "...with instructions" attachment) was classified as a query; the classifier
needs to treat instruction subject/attachment cues as an instructions signal. Part of the email-classification
cluster (relates TKT-006).
