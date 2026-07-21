---
id: TKT-314
title: Inbound-triage rewrite Phase 4 — migrate every taxonomy touchpoint together
status: backlog
priority: P1
area: triage
tickets-it-relates-to: [TKT-311, TKT-312, TKT-313]
plan: PLAN-016
research-link: docs/tickets/next/TKT-310-inbound-triage-ground-truth-corpus/evidence/code-read-2026-07-21.md
---

# Inbound-triage rewrite Phase 4 — migrate every taxonomy touchpoint together

## Problem

The nine-category taxonomy is read by the DB schema, the domain package, the SPA and both
services. A partial migration (some readers on v4, some on v5) is not safe — it creates a dual
taxonomy reader split. All touchpoints move together, in one slice, once Phases 1-3 are
designed and validated.

Confirmed present at the time of this ticket (2026-07-21):
`packages/domain/src/data/code-tables/inbound-email-classification.json`;
`packages/domain/src/codecs/index.ts` and `packages/domain/src/dto/index.ts` (`INBOUND_CATEGORIES`,
`dto/index.ts:535`); `database/baseline/000_enums_lookups.sql`, `120_inbound_email.sql`;
`database/tests/code-table-parity.mjs`; `contracts/runtime-contract.snapshot.json`;
`apps/web/src/features/inbox/inbox-email-type.ts`; `services/data-api/src/features/inbound/internal-triage-routes.ts`;
`services/orchestration/src/workflows/intake/classifyInbound.ts`, `triageUnified.ts`;
`scripts/evaluation/email/run_ab.py`. The alpha DB carries only 2 surviving `inbound_email` rows
(post PLAN-015 wipe) — this is the cheapest this migration will ever be; the window closes when
alpha traffic resumes.

## Change

Not designed. Per-touchpoint migration list above; a new `database/migrations/` delta following
the existing ~3-4 taxonomy deltas among the 56 total migrations; no v4 compatibility path (the
window is a near-empty DB, not a live-data migration). Back-fill the 2 surviving rows.

## Acceptance

- Every listed touchpoint reads v5 taxonomy; none reads a stale v4 copy.
- `database/tests/code-table-parity.mjs` and `contracts/runtime-contract.snapshot.json`
  regenerate clean.
- The 2 surviving `inbound_email` rows are back-filled to v5, not left on v4.
- `scripts/evaluation/email/run_ab.py` scores against v5 labels only once this ships (the v4→v5
  projection from TKT-311 was for the transition, not a permanent dual-read path).
