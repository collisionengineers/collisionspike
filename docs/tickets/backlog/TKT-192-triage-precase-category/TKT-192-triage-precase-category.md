---
id: TKT-192
title: Keep triage requests outside the case queue until instructions arrive
status: backlog
priority: P1
area: intake
tickets-it-relates-to: [TKT-023, TKT-034, TKT-058, TKT-084, TKT-118, TKT-145, TKT-166, TKT-193]
research-link: docs/tickets/backlog/TKT-192-triage-precase-category/evidence/operator-source/triage-process.md
plan: PLAN-004
---

# Keep triage requests outside the case queue until instructions arrive

## Problem
Providers send photos for an early roadworthy/repairable/total-loss opinion before issuing formal inspection instructions. These “Triage Only” requests are currently logged as cases, which wrongly allocates a Case/PO and puts preliminary work into the normal case/EVA lifecycle.

The email, photos and Collision Engineers response still matter. This ticket owns correct classification and no-case routing; TKT-193 owns the durable holding record and later adoption.

## Evidence
- [Operator process note](./evidence/operator-source/triage-process.md) — states that triage requests need their own category, must not receive a Case/PO and should link to the later instruction with all saved images/evidence.
- The QDOS `Triage Only Request` sample in the [TKT-193 evidence corpus](../TKT-193-precase-evidence-holding-adoption/evidence-manifest.json) asks for an initial roadworthy/repairable assessment and explicitly says official instructions will follow.
- [Engineer Triage sample](../TKT-193-precase-evidence-holding-adoption/evidence-manifest.json) — asks whether the photographed vehicle is repairable or a total loss.
- [Collision Engineers reply sample](../TKT-193-precase-evidence-holding-adoption/evidence-manifest.json) — records the preliminary assessment in the same thread.
- TKT-084 defines the analogous pre-instruction principle; TKT-118 establishes that identity may exist before a Case/PO.

## Proposed change
PROPOSED (not built): introduce an explicit Triage email category with a fail-closed no-case policy. Emit the source identity and classification facts needed by TKT-193’s holding seam, then stop; this ticket does not define a second storage, retention or adoption lifecycle.

## Acceptance
- **A1.** Every supplied “Triage Only Request” and “Engineer Triage” example classifies into the explicit Triage category, not Receiving work, Case query, Images received, Unidentified or a normal case status.
- **A2.** Receiving a triage request creates no case row, Case/PO, EVA record, normal case Archive folder or Review/Not Ready/Held queue entry. The inbox shows “Triage” and the next action “Review triage request”.
- **A3.** Classification emits one canonical handoff envelope to TKT-193 containing exact message/thread identity, mailbox, provider/reference/registration facts, received time and the classification/policy version; original and normalized values remain distinct.
- **A4.** The category route invokes TKT-193’s holding operation exactly once and records its accepted/reused/failed outcome. It does not implement an alternative email, attachment, folder or retention store.
- **A5.** Collision Engineers’ reply/assessment classifies as part of the same Triage conversation and can display “Answered” without creating a case; persistence and thread association use TKT-193’s contract.
- **A6.** A later formal instruction is routed to the standard case-intake path and supplies matching facts to TKT-193’s adoption operation. This ticket neither mints a Case/PO early nor duplicates the adoption decision.
- **A7.** Multiple candidates, conflicting reference/registration or insufficient corroboration display “Details need checking” and remain outside the case queues; target selection and byte ownership are delegated to TKT-193.
- **A8.** “Handled” is an inbox/Triage workflow state only. Searchability and retention/deletion follow TKT-193 and the binding retention policy; this ticket makes no indefinite-retention promise.
- **A9.** Replay, forwarded copies and response loss are idempotent at the classification/routing seam: one message identity produces one current Triage decision and one TKT-193 handoff operation, with no case or Case/PO side effect.
- **A10.** Automated coverage uses the supplied request/reply corpus for positive and near-miss classification, no-case routing and handoff outcomes. Signed-in live proof uses a naturally occurring operator-designated triage arrival and shows Triage with no Case/PO; storage/adoption live proof remains with TKT-193.

## Validation
- **Offline:** add exact request/reply classifier fixtures, no-case/no-Case-PO policy guards, TKT-193 handoff contract tests and SPA category/next-action/search/handled-state coverage; TKT-193 separately tests storage/adoption.
- **Signed-in/live:** observe a naturally arriving, operator-designated real triage thread with an assigned staff account, verify the Triage view and zero case/Case-PO side effects, and correlate the one TKT-193 handoff. Do not send, replay or convert fake production work for proof.
- **Regression:** rerun pre-instruction, images-received, manual images-only, retro reconstruction, evidence backfill, Case/PO allocation, inbox counts and case readiness suites.

## Research
Distilled 2026-07-13 from the [process note](./evidence/operator-source/triage-process.md) and [request/reply corpus](../TKT-193-precase-evidence-holding-adoption/evidence-manifest.json). The design keeps the Case/PO boundary tied to formal instructions; TKT-193 owns storage and adoption.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator process note](./evidence/operator-source/triage-process.md)
- [Scope-split context](./evidence/operator-source/context.md)
- [Triage sample corpus](../TKT-193-precase-evidence-holding-adoption/evidence-manifest.json)
