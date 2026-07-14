---
id: TKT-191
title: Suggest email replies and urgency only when justified
status: backlog
priority: P2
area: email
tickets-it-relates-to: [TKT-006, TKT-015, TKT-054, TKT-137, TKT-184]
research-link: docs/tickets/backlog/TKT-191-actionable-email-suggestions/evidence/email-suggestion-cohort-audit.md
plan: PLAN-004
---

# Suggest email replies and urgency only when justified

## Problem
Suggested action currently concentrates on filing and does not reliably tell a handler whether an email needs a reply or is time-sensitive. Adding those prompts without calibration would be worse than omitting them: bulk mail, acknowledgements, newsletters and automatic replies could be marked urgent or reply-needed despite containing no case-specific request.

## Evidence
- [Operator source material](./evidence/operator-source/) asks for useful reply-needed and urgency guidance and specifically calls for examining the mass-email cohort.
- Existing classification and filing suggestions are advisory and must remain separate from any reply or urgency advice.
- The required pre-rollout cohort, labels and error analysis are to be recorded at [email-suggestion-cohort-audit.md](./evidence/email-suggestion-cohort-audit.md).

## Proposed change
PROPOSED (not built):
- Audit the current mass-email cohort and a representative set of case emails before choosing rules or prompt changes.
- Add separate advisory suggestions for reply need and urgency, each with a short evidence-based explanation and an explicit uncertain outcome.
- Suppress unsupported positive suggestions and keep all reply, send, move and status changes under handler control.
- Provide a deliberate “Change suggestion” action with the three reply choices and three urgency choices;
  it corrects advice only, requires a reason, and never edits or sends the email.

## Acceptance
- **A1.** Before rollout, the current mass-email cohort and representative instructions, questions, acknowledgements, chasers, cancellations, automatic replies and out-of-office messages are inventoried and independently labelled “reply needed”, “no reply expected” or “uncertain”, and “urgent”, “not urgent” or “uncertain”, with the supporting text/thread fact recorded for each label.
- **A2.** The app displays “Reply needed” only when the email or its relevant thread contains a clear case-specific request, unanswered question, requested confirmation or required response. A sender name, category, attachment, greeting or general informational content is not sufficient.
- **A3.** When evidence is insufficient or conflicting, the app says “Check whether a reply is needed” rather than guessing. Newsletters, promotions and automatic acknowledgements receive no positive suggestion without a genuine direct request. An out-of-office message itself never receives “Reply needed” or “Urgent”, even when it quotes a request from an earlier human message; that original message may be evaluated separately.
- **A4.** The app displays “Urgent” only when it can name a concrete time-sensitive reason from the email or relevant thread, such as an explicit response deadline, imminent appointment or clearly time-bound instruction. Sender importance, capital letters, punctuation, category or bulk arrival alone never creates urgency.
- **A5.** Every positive or uncertain suggestion has a concise handler-facing explanation that cites the request, deadline or missing context without exposing scores, prompt wording, internal field names, service names or other engineering language.
- **A6.** Reply and urgency advice remains visually separate from the existing filing suggestion. It never sends or drafts a reply, moves an email, changes a case, or changes urgency/status without a distinct handler action and the confirmation required by that action.
- **A7.** The operator-approved mass-email cohort has zero unsupported “Reply needed” and zero unsupported “Urgent” outcomes before rollout; every remaining disagreement is documented and either corrected or deliberately returned as uncertain.
- **A8.** “Change suggestion” lets a handler choose reply needed/no reply expected/uncertain and urgent/not urgent/uncertain with a required short reason. The correction is append-only auditable with the original suggestion, explanation, version and actor, becomes an evaluation example, and does not change the original email or case.
- **A9.** Advice renders consistently in the inbox row/preview and email detail where those surfaces show suggested action, remains keyboard and screen-reader accessible, and uses plain case-handler language throughout.

## Validation
- Build the labelled cohort and publish its composition, decision rubric, disagreements and mass-email error analysis in the planned evidence artifact before implementation is selected.
- Add deterministic-rule and suggestion-schema tests for every cohort class, explicit request/deadline, negative signal, conflict and uncertain outcome.
- Run the full historical email evaluation corpus and report a before/after confusion matrix, with the required zero unsupported positives on the approved mass-email cohort.
- Add rendered and accessibility tests for positive, negative/suppressed, uncertain and explanation states, plus mutation guards proving suggestions alone cause no write or send.
- Before visible rollout, run the result in signed-in shadow mode on a current live sample, obtain operator adjudication, then capture representative rendered suggestions and audit records without sending or moving any email.

## Research
Distilled 2026-07-13 from the operator’s suggested-action review. The cohort inventory, decision rubric, adjudications, confusion matrix and signed-in shadow evidence belong in [evidence/email-suggestion-cohort-audit.md](./evidence/email-suggestion-cohort-audit.md).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator suggestion note](./evidence/operator-source/issue.md)
- [Planned research evidence](./evidence/email-suggestion-cohort-audit.md)
