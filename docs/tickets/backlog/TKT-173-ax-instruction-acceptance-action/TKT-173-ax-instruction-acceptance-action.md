---
id: TKT-173
title: Make AX instruction acceptance impossible to miss
status: backlog
priority: P2
area: intake
tickets-it-relates-to: [TKT-036, TKT-049, TKT-050, TKT-083, TKT-093]
research-link: docs/tickets/backlog/TKT-173-ax-instruction-acceptance-action/evidence/issue.md
plan: PLAN-004
---

# Make AX instruction acceptance impossible to miss

## Problem
AX instruction emails contain a link that a handler must use to accept or decline the work. The current intake can identify the instruction without making that external action prominent, so a case may appear received while AX is still waiting for confirmation.

Opening the link is not proof that AX recorded an acceptance. The app must make the required action persistent and safe, then let the handler record the outcome explicitly without ever claiming success merely because a browser tab opened.

## Evidence
- [Operator note](./evidence/issue.md) — states that every AX new instruction requires the email link to be clicked and that this must be made very clear.
- [Existing AX instruction fixture](<../../../../test-cases-and-data/test-cases/AX26353/AX26353/New inspection request - AX Ref_1070571.msg>) — sender engineersinspections@ax-uk.com, subject “New inspection request - AX Ref:1070571”, attached inspection request and an action URL on emailrequest.ax-uk.com.
- TKT-036 establishes correct provider-instruction classification; TKT-049/TKT-050 cover AX-specific extraction. This ticket owns the post-classification acceptance action and its audit state.

## Proposed change
PROPOSED (not built): for a corroborated AX new instruction, extract the exact allowlisted acceptance URL into a dedicated action record. Show a persistent case/inbox banner until a handler records “Accepted with AX” or “Declined with AX”.

The primary button uses plain copy such as “Open AX acceptance page”. It opens the exact validated HTTPS URL; it does not reconstruct a URL from the claim id and does not mark the instruction accepted. Missing or unsafe links fall back to “Open the original email” with a clear explanation.

## Acceptance
- **A1.** A corroborated AX new-instruction email with one valid acceptance link shows a prominent persistent message in both the inbox detail and linked case: “Action needed: accept or decline this instruction with AX.” The message remains until a handler records an outcome.
- **A2.** “Open AX acceptance page” opens the exact HTTPS URL extracted from the email only when its normalized host and path match the approved AX acceptance pattern. The displayed action cannot be supplied by a display name, attachment, quoted arbitrary link or lookalike domain.
- **A3.** Opening or returning from the AX page never changes the case to accepted and never displays success. Only an explicit signed-in “Accepted with AX” or “Declined with AX” confirmation records the outcome, actor and time.
- **A4.** If the acceptance link is absent, malformed, duplicated with conflicting targets or fails validation, no external action button is promoted. The handler instead sees “Acceptance link needs checking” and can open the original email; the case cannot silently look complete.
- **A5.** AX identity requires corroborating provider/sender and new-instruction signals. AX chases, cancellations, amendments, support mail and quoted old instructions do not receive a fresh acceptance action.
- **A6.** The action state is attached to the instruction/case, visible after reload and in the activity history, and idempotent under message replay or repeated confirmation. A later correction is explicit and audited rather than overwriting history.
- **A7.** Recording accepted/declined does not claim to have called AX, move the mailbox message, send a reply or alter unrelated readiness fields. Any future automated confirmation would require separate provider proof and is outside this ticket.
- **A8.** The supplied fixture and safe negative fixtures cover valid, missing, malformed, non-HTTPS, lookalike-host, conflicting-link, forwarded/quoted and non-instruction AX mail; signed-in proof exercises the exact link and both explicit outcomes without submitting a real acceptance unintentionally.

## Validation
- **Offline:** add parser/domain fixtures for the exact AX URL contract and negative link cases, API authorization/idempotency/audit tests, routing-precedence tests and SPA banner/focus/accessibility tests. Assert that navigation alone cannot call the outcome endpoint.
- **Signed-in/live:** use an operator-approved AX test instruction or inert copy. In the deployed SPA, verify the persistent message and exact href, open it without recording success, then record each outcome on controlled data and inspect the audit/history after reload. Do not accept or decline live work merely for verification.
- **Regression:** rerun AX instruction, cancellation, provider-chase, amendment, auto-attach and safe-link suites, plus a scan of rendered copy for banned implementation language.

## Research
Distilled 2026-07-13 from the [operator note](./evidence/issue.md). The repository already contains a grounded AX instruction fixture, so no link shape was invented for this ticket.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/issue.md)
- [AX instruction fixture](<../../../../test-cases-and-data/test-cases/AX26353/AX26353/New inspection request - AX Ref_1070571.msg>)
