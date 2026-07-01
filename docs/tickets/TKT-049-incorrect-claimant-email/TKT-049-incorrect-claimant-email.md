---
id: TKT-049
title: Claimant email wrongly set to AX team inbox
status: now
priority: P1
area: parsing
tickets-it-relates-to: [TKT-001]
research-link: docs/tickets/TKT-049-incorrect-claimant-email/evidence/operator-note.md
---

# Claimant email wrongly set to AX team inbox

## Problem
Claimant email is showing as `CreditRepair_TeamInbox@ax-uk.com`. That address is the AX
Credit Repair team inbox in the instruction header — not the claimant's email. Claimant
email is optional; blank is better than wrong.

## Evidence
- AX instruction PDFs/emails carry the team inbox after "please contact the Credit Repair team … by email on".
- Same pattern in AX audit corpus (`AX_01.txt` line 9).

## Proposed change
Reject provider/team inbox addresses in the claimant-email fallback (`_fallback_email`):
team-inbox patterns, noreply/engineers addresses, and emails appearing in "credit repair /
contact the team" context. Leave the field empty when no plausible claimant email exists.

## Acceptance
- AX instruction documents with only `CreditRepair_TeamInbox@ax-uk.com` leave claimant email blank.
- Explicit claimant/client email labels still extract correctly (no regression).
- Offline unit test covers the AX header pattern.

## Research
Operator drop-note in [evidence/operator-note.md](./evidence/operator-note.md).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
