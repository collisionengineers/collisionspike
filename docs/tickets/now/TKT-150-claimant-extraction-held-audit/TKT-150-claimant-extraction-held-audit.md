---
id: TKT-150
title: Restore claimant-name extraction and remediate affected held cases
status: now
priority: P1
area: parsing
tickets-it-relates-to: [TKT-001, TKT-022, TKT-086, TKT-130, TKT-135]
research-link: docs/tickets/now/TKT-150-claimant-extraction-held-audit/evidence/operator-note.md
plan: PLAN-004
---

# Restore claimant-name extraction and remediate affected held cases

## Problem
Open cases, including QDOS26079 and cases in Held, are missing claimant names even where the instruction email or document should contain one. Missing claimant names currently coexist with misleading queue placement, and the failure point between extraction, orchestration, persistence, and later merging is unknown.

## Evidence
- [Operator note](./evidence/operator-note.md) — named live example and requirement to inspect every held case.
- TKT-001/TKT-022 — established multi-format parser and document-layout rules.
- TKT-130 — readiness/queue contract that must treat a missing claimant as Not Ready.

## Proposed change
IN PROGRESS: the parser/signature failure family is fixed and immutably re-vendored at `engine-v2.22`. The remaining work is the full open-case claimant census, QDOS26079 trace, live parser deployment, safe source-backed remediation, readiness recomputation, and independent verification.

## Acceptance
- A reproducible census lists every active Held, Not Ready, and Review case whose claimant name is blank, grouped by provider, source format, intake path, parser version, and earliest source message/document.
- QDOS26079 is traced end to end with the exact source evidence and the first stage at which a present claimant name is lost or rejected.
- Representative samples for every observed failure family become permanent parser/orchestration fixtures before the fix; sibling-first/re-vendor rules in ADR-0018 are followed for parser changes.
- Claimant extraction recognises provider-specific labelled forms and ordinary instruction wording without taking case handlers, email-signature names, repairers, third parties, or insured names as the claimant.
- Explicit labelled claimant values outrank weaker email/body inference. Conflicting candidates remain visible for review rather than silently overwriting a stronger human or document value.
- The create, merge, replay-safe reconstruction, and later-document update paths persist the same resolved claimant value and record its source.
- When a Held case later gains a resolved provider, the same idempotent path also re-evaluates the hold, mints Case/PO when valid, and creates/adopts its archive folder; filling `work_provider_id` alone is not completion.
- A source that genuinely contains no defensible claimant name stays blank with a clear missing-detail reason; no placeholder or invented name is stored.
- Every case with a blank required claimant is Not Ready, never Review, until a valid value is saved.
- A backup-first, idempotent remediation reruns only affected cases from retained source evidence, preserves staff edits, and records before/after value plus source for each changed case.
- The post-remediation residual ledger accounts for every pre-run missing-claimant case as repaired, absent-in-source, conflicting, or failed with an actionable reason.
- Offline parser and orchestration tests pass across all observed layouts and negative controls.
- Independent live verification proves claimant extraction and persistence on at least one fresh case per repaired failure family and confirms the full residual census.

## Research
Distilled 2026-07-12 from the operator's live-case report; raw wording is in [evidence/](./evidence).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
