# Changes — TKT-035: Information-request misclassification (placeholder)

## Status
**Reclassified `backlog` → `blocked` (2026-07-07)** — blocked on the operator. This is a status
correction, not a build: the ticket cannot be specified until the operator supplies a sample.
(Distilled 2026-06-30 from spike-tickets-to-distill/miscategorised-emails; no code written.)

## Commits
- No code changes — status reclassification only.

## Summary
Placeholder for the "information request" misclassification class — part of the email-classification
cluster (relates TKT-006). The source folder was **empty** at distillation and `evidence/` holds only
`operator-note.md`; no sample email was ever supplied. Because no classifier rule can be defined without
a repro example, the correct state is **blocked-on-operator** (same class as TKT-032/057), not `backlog`.
Unblocks when the operator adds a sample `.eml` + a one-line description of the mis-routing.
