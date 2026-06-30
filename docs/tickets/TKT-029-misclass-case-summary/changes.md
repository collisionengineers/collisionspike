# Changes — TKT-029: Case-summary email misclassified as new case

## Status
Distilled 2026-06-30 from spike-tickets-to-distill/miscategorised-emails; not yet built.

## Commits
- No code changes yet.

## Summary
Part of the email-classification cluster (relates TKT-006). A case-summary/digest email was misread as a new case and entered intake; the classifier needs a non-actionable / query signal so summaries don't mint cases.
