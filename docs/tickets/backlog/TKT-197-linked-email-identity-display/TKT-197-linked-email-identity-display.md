---
id: TKT-197
title: Show a trustworthy registration and email reference on linked emails
status: backlog
priority: P1
area: intake
tickets-it-relates-to: [TKT-023, TKT-054, TKT-090, TKT-093, TKT-118, TKT-143, TKT-183, TKT-190]
research-link: docs/tickets/backlog/TKT-197-linked-email-identity-display/evidence/info.md
plan: PLAN-004
---

# Show a trustworthy registration and email reference on linked emails

## Problem
Some inbox rows are correctly linked to a case while their registration is blank, and some source
references are missing or inconsistently projected. The operator reports this frequently on AX work and
around MP26010. Filling both columns blindly from the case would be wrong: the binding inbox rule says
**Ref is the email's own reference**, while Case/PO belongs in Status. Only registration may fall back to
the linked case when the email itself has none.

The supplied Montreal Prestige email (`New Instruction - RA6458909.eml`) also demonstrates the deeper
failure shape: identity may need to be extracted from the message's attached document/images before the
email projection can be repaired. A display fallback cannot manufacture a value when both email and case
are blank.

## Evidence
- [Operator note](./evidence/info.md) — reports linked emails with blank registration/reference, frequent AX inconsistency and the MP26010 example.
- [Inbox screenshot](./evidence-manifest.json) — a linked row showing reference 128295.001 while the registration position is blank.
- [Supplied instruction email](./evidence-manifest.json) — Montreal Prestige message with source reference RA6458909, vehicle images and an attached document.
- TKT-054 split VRM and Ref columns; TKT-093 owns case attachment; TKT-190 owns full Case/PO in Status; TKT-143 owns resolved identity through image extraction.

## Proposed change
PROPOSED (not built): expose one source-aware email identity projection across inbox, detail, case history
and search. Ref is extracted only from that email's subject/body/attachments. Registration uses the email's
own value when present and otherwise may display the authorized linked-case registration with “From case”.
Case/PO remains in Status.

Trace and repair attachment parsing/projection for the supplied RA6458909 fixture and census affected
linked rows where both email identity and case fallback are absent. Backfill only defensible source values,
with provenance and an idempotent remediation ledger; do not copy a case reference into the email Ref.

## Acceptance
- **A1.** A linked email displays its source registration when present; otherwise it displays the linked case's non-empty registration with “From case”. Equal normalized values display once, and viewing never writes either record.
- **A2.** The Ref column and primary email-detail Ref show only a provider/client reference extracted from that email's subject, body or attachments. A linked case's reference or Case/PO is never substituted into Ref; Case/PO appears only in Status per TKT-190.
- **A3.** When an email source registration/reference conflicts with the linked case, both values and sources are available in detail with “Details do not match”. The inbox keeps the email's own Ref and does not overwrite, relink or silently choose a new case.
- **A4.** If the case lacks a registration but the email has one, the email value displays “From email” with a truthful missing-case-field state. If both lack a defensible value, the field remains honestly blank/unknown rather than borrowing from a candidate.
- **A5.** An authorized case-registration edit refreshes only linked rows using the case VRM fallback. Editing a case provider reference cannot rewrite an email's Ref and does not require reclassification of unrelated source identity.
- **A6.** Unlinked emails show only source-extracted identity and never borrow values from a suggested candidate. Linked state, Case/PO/Status, VRM source and email Ref are visually and accessibly distinct.
- **A7.** Inbox, email detail, case email history, global search and filters use the same projection and normalization rules. Pagination/counts remain stable, and search can find either the email's own Ref or the linked Case/PO without conflating their labels.
- **A8.** The projection is server-authorized and returns case fallback identity only for a case the signed-in user may view; list/search responses expose no hidden candidate or unrelated claimant details.
- **A9.** The supplied RA6458909 email is replayed through subject/body/attachment and image-document extraction. It retains RA6458909 as the email Ref and captures a registration only when present/readable in source material, with exact provenance. A census identifies AX/MP and other linked rows still blank after legitimate fallback, then a backup-first idempotent remediation repairs only source-proven values and accounts for every residual.
- **A10.** Automated coverage includes blank-email/non-empty-case VRM, non-empty-email/blank-case VRM, missing Ref with non-empty case reference, equal/conflicting identity, linked/unlinked rows, case edits, AX shapes and the supplied MP/RA fixture. Signed-in proof uses operator-designated real affected rows and performs no case edit solely for verification.

## Validation
- **Offline:** add one canonical projection contract with normalization/source/conflict/authorization tests; pin the RA6458909 message and attachment extraction; fail any attempt to fill email Ref from case reference/Case-PO; test the census/remediation ledger and every UI surface.
- **Signed-in/live:** inspect operator-designated affected AX/MP rows read-only, record source Ref, Status Case/PO and VRM fallback separately, and compare UI/API/database/source bytes. Run remediation only after backup and explicit approval, then account for every changed/residual row without manufacturing case data.
- **Regression:** rerun inbox VRM/Ref layout, auto-attach, global search, case save, evidence filename identity, attachment parsing and pagination/count suites.

## Research
Distilled 2026-07-13 from the [operator note, screenshot and source email](./evidence/) and the binding
inbox rule that Ref belongs to the email. This ticket deliberately does not use a case identity fallback
to hide missing attachment extraction.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/info.md)
- [Inbox screenshot](./evidence-manifest.json)
- [Supplied instruction email](./evidence-manifest.json)
