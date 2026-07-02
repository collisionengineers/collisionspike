---
id: TKT-021
title: Resolve Connexus claims-manager to the real provider (PCH/SBL)
status: now
priority: P2
area: intake
tickets-it-relates-to: [TKT-001]
research-link: docs/tickets/TKT-021-connexus-intermediary/evidence/operator-note.md
---

# Resolve Connexus claims-manager to the real provider (PCH/SBL)

## Problem
Connexus is a claims-management company. It is being flagged as a new
enquiry / new customer rather than as a known work source. In reality Connexus
*sometimes* sends work on behalf of an underlying principal — either PCH
(Performance Car Hire) or SBL. Intake needs to detect that the email comes from
Connexus and then determine which underlying principal (PCH or SBL) the work
actually belongs to, from the email body and/or the attachment, so the case is
routed to the correct provider rather than treated as a brand-new customer.

## Evidence
- `evidence/operator-note.md` — the operator's drop-note describing the
  Connexus intermediary behaviour and that PCH/SBL must be derived from the
  email/attachment.

## Proposed change
PROPOSED (not built):
- Recognise Connexus as an **intermediary / claims-management** sender class in
  the provider corpus, distinct from a direct work provider, so it is not
  classified as a new enquiry.
- Add a resolution step at intake that inspects the email body and the attached
  document for the underlying principal signal (PCH / Performance Car Hire vs
  SBL) and resolves `work_provider` to that principal rather than to Connexus.
- Where the underlying principal cannot be determined confidently, hold the case
  for human review with a clear "intermediary — principal unresolved" reason
  rather than silently creating a new customer.

## Acceptance
- An email from Connexus is no longer flagged as a new enquiry/customer.
- When the email/attachment indicates PCH, the case resolves to the PCH
  principal; when it indicates SBL, it resolves to SBL.
- When neither can be determined, the case is held for review with an explicit
  unresolved-principal reason (no spurious new customer created).

## Research
Distilled 2026-06-30 from an operator drop-note; raw material in [evidence/](./evidence/). No formal research pack yet.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
