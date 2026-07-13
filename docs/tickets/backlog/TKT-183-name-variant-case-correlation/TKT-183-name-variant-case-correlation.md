---
id: TKT-183
title: Match case emails when first names are shortened to initials
status: backlog
priority: P1
area: intake
tickets-it-relates-to: [TKT-023, TKT-058, TKT-082, TKT-093, TKT-101, TKT-139, TKT-145]
research-link: docs/tickets/backlog/TKT-183-name-variant-case-correlation/evidence/issue.md
plan: PLAN-004
---

# Match case emails when first names are shortened to initials

## Problem
A follow-up email headed “128199.001 Saira Khurshid” did not link even though the system holds an active case and several related messages. Some material uses the claimant’s full first name while other material uses an initial. That ordinary variation must not veto an otherwise well-supported case match.

Name similarity is also unsafe as a primary key. Common surnames and initials can describe different people, so the fix must strengthen normalization and evidence ordering without turning “S Khurshid” into a name-only auto-attach rule.

## Evidence
- [Operator note](./evidence/issue.md) — reports the active-case miss and identifies full-first-name versus initial usage as the likely contributing variation.
- [Supplied follow-up email](<./evidence/128199.001  Saira Khurshid.eml>) — sender sue@accidentspecialist.co.uk, subject “128199.001 Saira Khurshid” and body “Images have now been sent”.
- The sample’s exact provider reference is stronger evidence than the name spelling. TKT-023/TKT-093 own correlation and confident auto-attachment; this ticket makes their identity comparison tolerant without weakening ambiguity safeguards.

## Proposed change
PROPOSED (not built): normalize claimant identity into preserved raw text plus comparison tokens for title, given names, initials and surname. Apply a fixed evidence hierarchy in which exact Case/PO, exact provider reference, exact registration and trusted thread relation outrank name evidence.

Full-name/initial compatibility can corroborate a match and must not veto stronger exact evidence. It can never auto-attach on its own. Conflicting strong identifiers or more than one viable case produce an explicit “More than one case matches” decision instead of a guessed link.

## Acceptance
- **A1.** Claimant comparison treats titles, repeated whitespace, punctuation and case as insignificant and recognises Saira Khurshid, S Khurshid and S. Khurshid as compatible initial/full-name variants while preserving every original value for display and audit.
- **A2.** Matching uses a documented hierarchy: exact Case/PO, exact provider reference, exact normalized registration and trusted message-thread relation are strong evidence; provider identity and normalized claimant name are supporting evidence. A compatible name can never be the sole reason for automatic attachment.
- **A3.** A full-name/initial difference cannot veto a unique case already supported by a strong exact key. The supplied email’s 128199.001 reference must lead to the same active matter even if the case stores S Khurshid.
- **A4.** A conflicting exact reference, registration or provider scope cannot be overridden by a similar name. Surname-only, initial-only, fuzzy spelling and transposed-name matches remain insufficient without corroboration.
- **A5.** If two or more cases remain viable after the hierarchy, the email stays unattached and shows every candidate with the evidence for and against it. No arbitrary “best” candidate is selected, and no case is minted to escape ambiguity.
- **A6.** A unique high-confidence result attaches once through the canonical email/evidence lifecycle, surfaces the case link in the inbox, backfills eligible attachments and records which evidence rung decided the match. Replay and response loss cannot duplicate the link or evidence.
- **A7.** Staff can reject or correct a suggested/automatic association. The override is audited, persists across reprocessing and prevents the same unchanged evidence from silently restoring the rejected link.
- **A8.** The supplied email, full↔initial variants, punctuation/title variants, common-surname collisions, conflicting-reference/registration cases, provider mismatch, multiple candidates and idempotent replay are pinned in automated coverage; signed-in proof demonstrates both the unique match and the ambiguity path.

## Validation
- **Offline:** add pure identity-normalization tests, evidence-hierarchy decision tables, exact sample/eval fixtures, API attach/override/idempotency tests and evidence-backfill integration coverage. Assert the decision explanation names strong/supporting signals without exposing implementation terms in the UI.
- **Signed-in/live:** in an operator-approved copy or isolated replay of the supplied email, show the signed-in inbox linking to the intended active case despite Saira/S variation, with one audit and one evidence set. A controlled second-candidate scenario must remain unattached and explain the ambiguity.
- **Regression:** rerun ref/VRM/thread correlation, retro search tokenization, auto-attach, wrong-case QDOS and case-link evidence suites. Compare false-positive rates on the existing email corpus before enabling the change.

## Research
Distilled 2026-07-13 from the [operator note and original email](./evidence/). The proposed rule fixes a name variation only inside the existing evidence ladder; it does not create a claimant-name primary key.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/issue.md)
- [Supplied follow-up email](<./evidence/128199.001  Saira Khurshid.eml>)
