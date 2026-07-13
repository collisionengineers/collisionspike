---
id: TKT-170
title: Classify website contact forms as Website enquiries
status: now
priority: P1
area: email
tickets-it-relates-to: [TKT-006, TKT-029, TKT-034, TKT-081, TKT-082, TKT-120]
research-link: docs/tickets/now/TKT-170-website-enquiry-classification/evidence/website-general-enquiry.eml
plan: PLAN-004
---

# Classify website contact forms as Website enquiries

## Problem
A prospective-customer message submitted through the Collision Engineers website was classified as a Case update. The message legitimately arrives from Collision Engineers' mail infrastructure, so sender identity alone makes it look internal, but it is a new general enquiry with no existing case and must never enter the existing-case update lane.

## Evidence
- [Supplied website enquiry email](./evidence/website-general-enquiry.eml) — exact original message retained as a classifier fixture.
- Deterministic fingerprint in the sample: sender `mail@noreply.collisionengineers.co.uk`, subject beginning `New General Enquiry -`, body heading `General Enquiry from the Website`, and footer `Submitted via the Collision Engineers website contact form.`
- The sample is addressed to `info@collisionengineers.co.uk`, contains the visitor's Name/Email/Phone/Message fields, and has no provider instruction or established-case meaning.
- The live screenshot shows it labelled as a case-related query/update path and unable to locate a case.

## Proposed change
Add an append-only top-level `website_enquiry` category with the handler-facing label “Website enquiries” and a `website_general_enquiry` subtype. A deterministic rule recognises the website form using multiple corroborating headers/body cues before generic case-reference, update or AI-assisted routing. These emails are visible as enquiries, never mint or update a case automatically, and file to the enquiries area when a handler chooses the existing Outlook action.

## Acceptance
- The supplied `.eml` classifies deterministically as `website_enquiry / website_general_enquiry` before generic Case update, Query or Receiving work rules.
- The rule requires the trusted webform sender/domain plus corroborating subject or body form markers; a display name, one phrase, or a similar external message alone cannot spoof the category.
- Website enquiries never auto-create a case, never auto-attach to an existing case and never take the Case update action solely because the free-text message contains a registration or reference-like token.
- The category and subtype are append-only across classifier constants, domain types/codecs, database lookup values, Data API mappings/counts/filters, assisted-classifier contracts and the SPA.
- The inbox displays “Website enquiry” on the row and offers a “Website enquiries” type filter/category; the handler-facing text contains no implementation terminology.
- The existing optional Outlook filing action resolves the subtype to `Inbox/Queries/Enquiries`; no mailbox message is moved by tests or verification.
- The exact supplied `.eml` is included in the triage corpus with its expected category/subtype, alongside negative near-match and reference/registration-in-message fixtures.
- Parser, domain, API, orchestration and SPA tests prove precedence, code parity, non-minting routing, folder suggestion and display/filter behavior.
- Live verification reprocesses or safely probes the affected message read-only and shows the corrected category without changing the Outlook mailbox.

## Research
Distilled 2026-07-13 from the operator-supplied original email. “From Collision Engineers” describes the transport, not the business sender: the visitor's contact fields and explicit webform markers define the disposition.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)

