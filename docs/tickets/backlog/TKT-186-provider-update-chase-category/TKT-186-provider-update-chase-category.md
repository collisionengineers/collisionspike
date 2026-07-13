---
id: TKT-186
title: Separate provider chases from case queries
status: backlog
priority: P2
area: email
tickets-it-relates-to: [TKT-006, TKT-030, TKT-031, TKT-043, TKT-046, TKT-093, TKT-170, TKT-187]
research-link: docs/tickets/backlog/TKT-186-provider-update-chase-category/evidence/info.md
plan: PLAN-004
---

# Separate provider chases from case queries

## Problem
Providers regularly ask whether an estimate or report is ready, or simply ask for an update on existing work. Those messages are currently folded into the broad Case query lane even though they represent a distinct operational obligation: the provider is chasing Collision Engineers for progress.

The distinction must not turn a chase into new work. Some messages contain attachments, references, registrations or quoted instructions, and broad keyword matching could otherwise mint a case or swallow genuine amendments, cancellations and new instructions.

## Evidence
- [Operator note](./evidence/info.md) — requests a category separate from Case query for providers chasing an update.
- [General update sample](<./evidence/Re100290.012_The Car Hire Specialists.eml>) — asks “Any updates regarding this case?” and carries reference 100290.012.
- [AX report chase](./evidence/REPORT.eml) — asks for a report on AX reference 1075184 and registration JY04 ELY.
- [Estimate-chase corpus](../TKT-187-multi-case-provider-chase-linking/evidence/) — repeatedly asks whether estimates are in, with one or several AX references/registrations.
- TKT-046 separated case updates from general queries; TKT-187 owns associating one chase with several existing cases.

## Proposed change
PROPOSED (not built): add an append-only provider_chase category with handler-facing label “Provider chase” and grounded subtypes for report, estimate and general update chases. Apply it when a recognised work provider asks for progress on existing work without issuing new instructions or supplying a substantive amendment/decision.

Provider chase outranks generic Case query, but deterministic new instruction, cancellation, report amendment, payment/remittance and evidence-received rules retain their intended precedence. The category is never allowed to mint a case.

## Acceptance
- **A1.** The general update, AX report and singular/multi estimate samples classify as Provider chase with the appropriate general/report/estimate subtype, not Case query, Case update, Unidentified or Receiving work.
- **A2.** The rule requires corroborated provider identity plus progress-chase intent tied to existing work. Generic words such as “report”, “estimate”, “update” or a sender display name alone are insufficient.
- **A3.** Provider chase is evaluated before the generic Case query fallback but cannot override stronger grounded meanings: genuine new instructions/re-inspections, cancellations, report amendments, payments/remittances and newly supplied case evidence keep their correct categories.
- **A4.** A Provider chase never creates or retro-reconstructs a case, never allocates a Case/PO and never treats an attached old instruction/report or quoted thread as fresh work. Unmatched references stay in the chase lane with a clear “Case not found” reason.
- **A5.** A uniquely matched single-case chase uses the canonical association behavior; a multi-case chase hands its itemized references to TKT-187. Classification does not duplicate the inbound message or discard unmatched items.
- **A6.** The inbox row, detail view, type filter, counts and handling actions show “Provider chase” in plain language and distinguish “Estimate”, “Report” or “Update” where known. The suggested next action is to open the related case(s), not create one.
- **A7.** Category/subtype values remain consistent across classifier corpus, domain codecs, database values, API mapping/filtering/counts and the SPA. Staff overrides are audited and survive reprocessing.
- **A8.** Message replay and repeated classification are idempotent. One inbound message has one current category and one audit history, with no duplicate case association, reply task or Archive copy caused by rerun.
- **A9.** Exact samples and negative fixtures cover one/many references, attachments, quoted instructions, genuine amendment/cancellation/new-work/payment/evidence mail, external general questions and ambiguous provider identity; signed-in proof covers category, filter and no-mint behavior.

## Validation
- **Offline:** add every supplied email to the classifier corpus, implement precedence decision tables, prove the never-mint route in domain/API tests, and cover taxonomy parity, filter/count behavior, overrides and idempotency across orchestration and SPA.
- **Signed-in/live:** safely probe at least one general, report, singular-estimate and multi-estimate sample. In the deployed signed-in inbox, record the Provider chase label/subtype/filter and case-link disposition; corroborate that case count and Case/PO allocations do not change.
- **Regression:** rerun Case query/update, new instruction, report chaser, report amendment, cancellation, billing, images-received and website-enquiry suites. Record precision/recall changes for the existing corpus before activation.

## Research
Distilled 2026-07-13 from the [operator note and original messages](./evidence/) plus the [estimate-chase corpus](../TKT-187-multi-case-provider-chase-linking/evidence/). TKT-186 defines classification and precedence; TKT-187 separately defines safe one-to-many case association.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Provider-chase note](./evidence/info.md)
- [Estimate-chase note](../TKT-187-multi-case-provider-chase-linking/evidence/info.md)
- [General update sample](<./evidence/Re100290.012_The Car Hire Specialists.eml>)
- [AX report sample](./evidence/REPORT.eml)
- [Singular estimate sample](../TKT-187-multi-case-provider-chase-linking/evidence/ESTIMATE_singular.eml)
- [Multi-estimate sample](../TKT-187-multi-case-provider-chase-linking/evidence/ESTIMATES_multi.eml)
