# Verification — TKT-035: Information-request misclassification (placeholder)

## Verdict
BLOCKED (not implementable yet) — awaiting operator input.

## Evidence
No repro email in `evidence/` — the source folder
(`spike-tickets-to-distill/miscategorised-emails/information-request/`) was empty at distillation
(2026-06-30); `evidence/` holds only `operator-note.md`. No classifier rule can be specified without a
sample, so the ticket is blocked-on-operator, not merely un-started.

## Pending / gaps
Operator must supply a sample "information request" email plus a one-line description of the mis-routing.
Until then no rule can be defined for this class.

## How to re-verify (once unblocked + built)
Once a sample is supplied and a rule built: re-intake the sample `.eml`; confirm it routes to the correct
"information request" handling rather than the category it was wrongly assigned.
