# Changes — TKT-038: Bare acknowledgement ('Thanks Ed') misclassified as query
## Status
Distilled 2026-06-30 from spike-tickets-to-distill/miscategorised-emails; not yet built.
## Commits
- No code changes yet.
## Summary
A reply whose body is just "Thanks Ed" was falsely classified as a query; the classifier needs a low-content
acknowledgement filter. Part of the email-classification cluster (relates TKT-006).
