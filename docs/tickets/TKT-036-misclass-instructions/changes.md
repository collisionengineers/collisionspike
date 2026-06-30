# Changes — TKT-036: Work-instructions email misclassified as query
## Status
Distilled 2026-06-30 from spike-tickets-to-distill/miscategorised-emails; not yet built.
## Commits
- No code changes yet.
## Summary
An instructions email (with a "...with instructions" attachment) was classified as a query; the classifier
needs to treat instruction subject/attachment cues as an instructions signal. Part of the email-classification
cluster (relates TKT-006).
