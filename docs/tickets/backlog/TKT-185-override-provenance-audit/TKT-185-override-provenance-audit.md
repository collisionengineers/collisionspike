---
id: TKT-185
title: Audit what actually caused each category override
status: backlog
priority: P1
area: ai
tickets-it-relates-to: [TKT-006, TKT-015, TKT-056, TKT-081, TKT-112, TKT-127, TKT-137]
research-link: docs/tickets/backlog/TKT-185-override-provenance-audit/evidence/info.md
plan: PLAN-004
---

# Audit what actually caused each category override

## Problem
Emails shown as “Overridden” are potentially valuable evidence for improving categorisation, but that label does not prove that GPT changed them. A row may reflect a staff edit, an accepted suggestion, a deterministic rule, another system writer, a migration/backfill, or an event whose provenance was not retained. Treating the entire cohort as model output could tune the wrong component, erase a valid human decision and create new false positives.

## Evidence
- [Operator note](./evidence/info.md) — asks for close review of every overridden email and correction of both missed rules and false model overrides.
- [Screenshot](./evidence/1.png) — supplied view of the “Overridden” cohort.
- ADR-0019 defines the gated AI pass as a suggestion writer rather than an actor, so accepted suggestions, staff actions and system decisions must be distinguished in the audit instead of attributed collectively to a model.

## Proposed change
PROPOSED (not built): freeze a reproducible cohort, reconstruct the decision lineage for every row, review each source email/thread/attachment against the approved taxonomy, and publish a row-level provenance/correctness ledger. This ticket is audit-only: it may pin reviewed fixtures and draft atomic remediation tickets, but it does not change a production rule, prompt, gate, writer or historical category.

No handler-facing message should name a model or imply it acted unless the retained event proves that. Plain copy should say who changed the category or that the source is unknown.

## Acceptance
- **A1.** A versioned cohort query defines exactly what “Overridden” means in the current schema/UI, records the time/mailbox scope and immutable email/decision IDs, and reconciles its count to the signed-in view with every row accounted for once.
- **A2.** Every cohort row is assigned one evidence-based provenance class: staff manual change, staff acceptance of an AI suggestion, deterministic rules/policy writer, automated AI writer (only if such a path is actually proved), migration/backfill/repair, another named system writer, or unknown. Classes are not inferred from the final label alone.
- **A3.** Each provenance decision cites durable evidence such as actor principal, audit action, previous/new category, suggestion ID and acceptance event, model/run/version ID, rule/policy version, operation/correlation ID and timestamps. Missing or conflicting evidence lowers confidence and remains visible rather than being filled by assumption.
- **A4.** Every email in the frozen cohort is reviewed against its raw message, relevant attachments and thread/case context. The ledger records expected category/subtype, whether the final category is correct, rationale and the decisive source signals; no sampling is substituted for full-cohort review.
- **A5.** The ledger reconstructs the ordered sequence of initial classification, contextual policy decision, suggestion generation, acceptance/rejection, manual edit and final displayed state where available, separating a genuine category change from a UI label or data-migration artifact.
- **A6.** Unknown provenance remains `unknown`; historical staff actions are not rewritten as model actions, and a correct final category is not treated as proof that the mechanism which produced it was correct.
- **A7.** Correct decisions become reviewed regression fixtures mapped to the proven originating path. Any proposed deterministic-rule hardening is described in a dependent atomic ticket with nearby instruction/query/update/cancellation/acknowledgement controls; no runtime hardening ships from this audit ticket.
- **A8.** Every incorrect decision is mapped to a dependent remediation ticket only after the responsible writer and failure mode reproduce. The ticket specifies the required full relevant evaluation or deterministic controls; broad tuning based merely on the “Overridden” label is prohibited, and no prompt/model/gate/rule change ships here.
- **A9.** The ledger and every dependent ticket preserve staff changes and accepted-suggestion history. Any future current-row correction must be separately attributed and reversible where supported; this audit performs no historical/current-row rewrite.
- **A10.** Gaps that prevent reliable future attribution result in atomic follow-up tickets for the exact writer/schema/telemetry surface, with priority and acceptance. The audit does not invent a backfill; existing rows without proof remain unknown.
- **A11.** The final report reconciles 100% of the cohort by provenance, correctness and disposition; names every reviewed fixture and dependent follow-up ticket; and independently reconciles every cohort identity/outcome against authorized source content plus signed-in UI and database/audit evidence. No representative sample is substituted for whole-cohort accounting.

## Validation
- **Offline:** snapshot the cohort query; build per-row lineage from retained audit/suggestion/policy records; pin reviewed emails as local regression fixtures; run deterministic classifier/policy suites and any model evaluation only for a path actually proved to use that model.
- **Signed-in/live:** reconcile every cohort row identity and displayed outcome read-only against the deployed view/database, and match every row to the authorized raw message/thread/attachments used in the semantic review. No production correction or synthetic message is part of this audit.
- **Independent review:** a second reviewer challenges every AI attribution and every `unknown`, recomputes the aggregate totals and confirms that no rule, prompt or historical row was changed without cited causal evidence.

## Research
Distilled 2026-07-13 from the operator's [override audit note](./evidence/info.md), screenshot and the current suggestion-first architecture. The ticket deliberately does not accept the note's initial assumption that GPT produced every marked row.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/info.md)
- [Screenshot](./evidence/1.png)
