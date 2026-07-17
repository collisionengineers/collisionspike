# Operator note — own-report prevention design (guard 1 of 3), approved 2026-07-16

## Incident

Live case QDOS26007 was wrongly MINTED from a provider query email quoting our own delivered
report ("Please provide the breakdown for the attached report", subject in QDOS instruction
format "(EREF33) RTA on 11/05/2026 : Miss K— H—" — claimant name redacted here per evidence
rules; verbatim on the live triage row for QDOS26007).

Verified 2026-07-16: the current classifier abstains this verbatim email to other/other (0.3) —
no mint, and 'other' is retro-trigger eligible LOCATE-ONLY (TKT-219), so the arrival is handled.
But prevention of the CLASS currently rests entirely on the classifier never wrongly saying
receiving_work.

## The operator-approved decision table

| Attachment situation | Outcome |
|---|---|
| OUR report (SHA or our-ref match), any classification | Correspondence: link/route to the matched case; retro-reconstruct if the matter predates the system; never mint |
| THEIR report + instruction-typed doc or instruction body signals (audit flow) | Mint audit case — unchanged from today |
| THEIR report, no instruction signals anywhere | No mint; today abstains to other → retro locate; post-parse hold as backstop if classification ever says receiving_work |
| No report involved | Unchanged |

## Guard 1 — OWN-REPORT RECOGNITION (this ticket; two layers)

(a) exact — SHA-256 lookup of every inbound attachment across the ENTIRE evidence store (all
cases; content-addressed, evidence rows are case-linked so a hit identifies the specific case)
+ ingest our OUTBOUND delivered report at the mark-done delivery step, tagged as OURS (a
distinct evidence class from engineer_report, which currently means THEIR reports arriving
inbound).

(b) transform-tolerant — parser content-types the doc as report AND our own report/reference
number (576003-series) or letterhead markers are extractable from its text → identifies the
case even after re-encode/scan.

Ours-detection runs BEFORE any hold rule in decision order (a positive converts "suspicious"
into positively-identified correspondence). Third-party reports can never false-positive on
either layer.

## Siblings

Guard 2 (no-instruction hold) → TKT-235. Guard 3 (pre-mint archive probe) → TKT-236.
Classifier eval fixture pin → TKT-237. Related shipped work: TKT-232 (PR-102 review
remediation), TKT-233 (anchor provenance, own-domain claimant exclusion).

A separate remediation runbook for already-wrongly-minted cases (excludeCaseIds retro lever +
reconstruct-then-merge) exists in session notes and is deliberately NOT part of this
prevention distillation — related direction only.
