# Operator note — own-report prevention design (guard 2 of 3), approved 2026-07-16

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

## Guard 2 — NO-INSTRUCTION HOLD (this ticket; post-parse backstop)

When classification said receiving_work but the parse finds NO instruction-typed document AND
no instruction body signals → Held needs_review with an honest reason, never a clean mint.

Must NOT key on "report present" — audit emails legitimately carry third-party reports; the
multi-doc parse already selects the instruction among attachments
(services/orchestration/src/workflows/intake/parse.ts, content_typing / attachmentTypings;
the attachment_typing module's own docstring records the pipeline-reorder follow-up this
implements).

Ours-detection (TKT-234) runs BEFORE any hold rule in decision order.

## Siblings

Guard 1 (own-report recognition) → TKT-234. Guard 3 (pre-mint archive probe) → TKT-236.
Classifier eval fixture pin → TKT-237.
