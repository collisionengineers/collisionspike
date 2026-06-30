# Changes — TKT-030: Report-chaser misclassified as new work

## Status
Distilled 2026-06-30 from spike-tickets-to-distill/miscategorised-emails; not yet built.

## Commits
- No code changes yet.

## Summary
Part of the email-classification cluster (relates TKT-006). A report-chaser on an existing job was classed as new work; suspected root cause is the classifier scanning the entire email chain rather than the specific received message — the thread-scoping fix is shared with TKT-033.
