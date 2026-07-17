# Operator note — own-report prevention design (guard 3 of 3), approved 2026-07-16

## Incident

Live case QDOS26007 was wrongly MINTED from a provider query email quoting our own delivered
report ("Please provide the breakdown for the attached report", subject in QDOS instruction
format "(EREF33) RTA on 11/05/2026 : Miss K— H—" — claimant name redacted here per evidence
rules; verbatim on the live triage row for QDOS26007). Verified 2026-07-16: the current
classifier abstains this verbatim email to other/other (0.3) — no mint; 'other' is
retro-trigger eligible LOCATE-ONLY (TKT-219). Prevention of the class currently rests entirely
on the classifier never wrongly saying receiving_work.

## The operator-approved decision table

| Attachment situation | Outcome |
|---|---|
| OUR report (SHA or our-ref match), any classification | Correspondence: link/route to the matched case; retro-reconstruct if the matter predates the system; never mint |
| THEIR report + instruction-typed doc or instruction body signals (audit flow) | Mint audit case — unchanged from today |
| THEIR report, no instruction signals anywhere | No mint; today abstains to other → retro locate; post-parse hold as backstop if classification ever says receiving_work |
| No report involved | Unchanged |

## Guard 3 — PRE-MINT ARCHIVE PROBE (this ticket)

Before minting from receiving_work, probe the archive roots (existing retroBoxLocate
machinery) for an existing folder matching ref/VRM; a hit = historical matter → hold /
reconstruct path instead of blind-minting a duplicate identity. Definitive guard post-cutover;
works in dev against the test archive.

## Siblings

Guard 1 (own-report recognition) → TKT-234. Guard 2 (no-instruction hold) → TKT-235.
Classifier eval fixture pin → TKT-237.
