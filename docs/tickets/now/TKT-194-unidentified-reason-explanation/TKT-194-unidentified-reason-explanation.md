---
id: TKT-194
title: Explain why an email needs sorting
status: now
priority: P2
area: email
tickets-it-relates-to: [TKT-006, TKT-137, TKT-157, TKT-191]
research-link: docs/tickets/now/TKT-194-unidentified-reason-explanation/evidence/unidentified-reason-live.md
plan: PLAN-004
---

# Explain why an email needs sorting

## Problem
An email labelled Unidentified can show a “Why this label” section containing broad clues such as a recognised company, an automatic-reply pattern or ongoing conversation. Those clues do not explain why a suitable category could not be chosen and can contradict a separate assistant suggestion. The handler is left without a concrete next action.

## Evidence
- [Operator source material](./evidence/operator-source) shows an Unidentified email whose explanation lists generic positive clues while a separate suggestion proposes Acknowledgement.
- TKT-137 owns accepting or ignoring a pending suggestion; this ticket keeps that pending suggestion distinct from the reason the current email still needs sorting.
- The reason mapping and post-deployment example are to be recorded at [unidentified-reason-live.md](./evidence/unidentified-reason-live.md).

## Proposed change
PROPOSED (not built):
- Replace the Unidentified explanation with “Why this needs sorting”.
- Derive one or more concrete handler-facing reasons from stable reason codes for missing, weak or conflicting evidence.
- Pair the reason with an appropriate next action while leaving any assistant suggestion clearly pending and separate.

## Acceptance
- **A1.** When the current email type is Unidentified, the section heading is “Why this needs sorting”, not “Why this label”; identified email types may retain “Why this label” where it accurately explains their chosen type.
- **A2.** Every Unidentified email shows at least one concrete reason that describes why a category could not be chosen: not enough message content, only a signature or attachment with no clear purpose, weak clues matching several types, conflicting clues, an unreadable relevant attachment, or missing earlier-message context.
- **A3.** The explanation does not present generic facts such as a recognised sender, being part of a conversation or looking automated as if those facts alone explain Unidentified. Each displayed fact must name the decision problem it caused.
- **A4.** Every reason supplies a useful next action chosen from the actual problem, such as “Choose the email type”, “Check the attachment” or “Open the earlier messages”; an unavailable action is not offered.
- **A5.** A pending assistant suggestion remains in a separate card labelled as a suggestion with its own explanation and Accept/Ignore actions. Its proposed type is not presented as the current type until accepted, and accepting or ignoring it keeps the existing audit behaviour.
- **A6.** If the reason data is absent or unrecognised, the app falls back to “We could not tell what this email is about. Choose the email type.” and records the unmapped reason for remediation; it never displays a blank explanation or a raw stored value.
- **A7.** Rendered headings, reasons, actions, fallback and suggestion copy contain no implementation, cloud, process or specification language banned by the app-copy rule.
- **A8.** The explanation and actions are screen-reader structured, keyboard operable, readable at supported narrow widths and 200% zoom, and do not obscure the email preview.

## Validation
- Define stable reason-code fixtures for every accepted reason, combinations of weak/conflicting evidence and the unmapped fallback.
- Add rendered-copy tests for Unidentified versus identified headings, prohibited generic explanations, appropriate next actions and absence of banned language.
- Add interaction and audit regression tests for the separate Accept/Ignore suggestion card.
- Add keyboard, screen-reader, narrow-layout, 200% zoom and preview-overlap checks.
- After deployment, verify signed in against the supplied automatic-reply example plus examples for insufficient content, conflicting clues and missing context; capture the displayed reason, next action and suggestion separation in the planned evidence artifact.

## Research
Distilled 2026-07-13 from the operator’s Unidentified-email review. The approved reason-code table and signed-in examples belong in [evidence/unidentified-reason-live.md](./evidence/unidentified-reason-live.md).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator unidentified-reason note](./evidence/operator-source/info.md)
- [Planned research evidence](./evidence/unidentified-reason-live.md)
