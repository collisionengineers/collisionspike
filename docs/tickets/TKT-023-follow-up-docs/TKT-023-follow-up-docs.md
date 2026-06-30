---
id: TKT-023
title: Link follow-up documents/emails to the existing case + Box
status: backlog
priority: P2
area: intake
tickets-it-relates-to: [TKT-003, TKT-004, TKT-009]
research-link: docs/tickets/TKT-023-follow-up-docs/evidence/operator-note.md
---

# Link follow-up documents/emails to the existing case + Box

## Problem
We sent an outgoing request asking the provider for an additional document. The
provider replied with that document. That reply was wrongly categorised as a
**new case** instead of being recognised as a follow-up to an existing,
in-flight case. The follow-up email and its document should be attached to the
**existing case**, and the document should also be added to that case's **Box**
folder — not spawn a duplicate case.

## Evidence
- `evidence/operator-note.md` — the operator's drop-note describing the
  follow-up-mis-categorised-as-new-case behaviour.
- `evidence/sent/RE Enclosing Inspection Request to Engineers 2 (Collision
  Engineers Ltd)   575985.eml` — our **outgoing** request for the additional
  document (the message the provider replied to).
- `evidence/original/Our ref 576299.eml` — the **incoming** follow-up reply that
  was mis-categorised as a new case.
- `evidence/original/16DL.pdf` — the additional document attached to the reply
  (the one that should be linked to the existing case and pushed to Box).
- `evidence/original/16DL - Diminution - 2026-06-29_Manual.pdf` — a diminution
  PDF accompanying the reply.

## Proposed change
PROPOSED (not built):
- At intake, detect that an incoming email is a **reply / follow-up** to a
  request we sent (e.g. shared "Our ref", in-reply-to / references headers, or
  thread/subject correlation) and correlate it to the originating case rather
  than opening a new one.
- When correlated, append the email and its attachments to the existing case's
  evidence/email trail and update its status/chaser state (request satisfied).
- Push the new document(s) to the existing case's Box folder via the live Box
  path (folder already exists at intake under the Case/PO name).
- Fall back to human review when correlation confidence is low rather than
  silently creating a new case.

## Acceptance
- The reply email is attached to the existing case (no duplicate case created).
- The attached document(s) appear in the existing case's evidence and in its Box
  folder.
- The outstanding-document chaser for that case is marked satisfied.
- Low-confidence correlations are routed to review, not auto-merged or
  auto-new-cased.

## Research
Distilled 2026-06-30 from an operator drop-note; raw material in [evidence/](./evidence/). No formal research pack yet.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
