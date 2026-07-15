# Changes — TKT-029: Case-summary email misclassified as new case

## Status
done — live-probed against the deployed engine 2026-07-02; locked in as an eval-corpus regression pin.

## Commits
- No code change required — the deterministic classifier (`non_actionable`/`case_summary` rule, ahead of
  the receiving-work rules) already handled this sample correctly.
- 2026-07-02 — rules-engine-v2 Phase 0/1 evidence pass: live-probed the evidence email against the
  deployed `/classify-email` route; result recorded as an eval-corpus regression pin (manifest id
  `tkt029-case-summary`, `scripts/evaluation/email/`). See [verification.md](./verification.md).

## Summary
Part of the email-classification cluster (relates TKT-006). A case-summary/digest email was misread as a new case and entered intake; the classifier needs a non-actionable / query signal so summaries don't mint cases.
