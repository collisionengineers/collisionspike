# Changes — TKT-038: Bare acknowledgement ('Thanks Ed') misclassified as query
## Status
done — live-probed against the deployed engine 2026-07-02; locked in as an eval-corpus regression pin.
## Commits
- No code change required — `email_classifier.py`'s bare-acknowledgement detector
  (`_is_bare_acknowledgement`, named for this ticket) already routes "Thanks Ed" to
  `non_actionable`/`acknowledgement`.
- 2026-07-02 — rules-engine-v2 Phase 0/1 evidence pass: live-probed the evidence email against the
  deployed `/classify-email` route; result recorded as an eval-corpus regression pin (manifest id
  `tkt038-bare-ack`, `scripts/evaluation/email/`). See [verification.md](./verification.md).
## Summary
A reply whose body is just "Thanks Ed" was falsely classified as a query; the classifier needs a low-content
acknowledgement filter. Part of the email-classification cluster (relates TKT-006).
