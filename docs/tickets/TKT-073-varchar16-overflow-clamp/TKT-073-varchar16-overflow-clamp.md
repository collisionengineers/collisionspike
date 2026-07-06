---
id: TKT-073
title: Intake write fails with "value too long" — clamp over-length field before insert
status: backlog
priority: P2
area: intake
tickets-it-relates-to: [TKT-071, TKT-001]
research-link: docs/tickets/TKT-073-varchar16-overflow-clamp/evidence/operator-note.md
---

# Intake write fails with "value too long" — clamp over-length field before insert

## Problem

Live App Insights shows 2026-07-03 API errors
`value too long for type character varying(16)` on an **internal** (`withServiceAuth`) route —
an intake-pipeline write, not a user request. Some field (most plausibly a ref/VRM candidate;
`varchar(16)` columns include `inbound_email.body_vrm` and `case_.vrm`) occasionally exceeds
its column, and the insert fails instead of being truncated — so that message's write is lost
or retried. The exact field must be identified from the 03/07 stack trace before fixing.

## Evidence

- `evidence/operator-note.md` — plan diagnostic + § 8 (2026-07-06 planning session).
- Live telemetry: 03/07 App Insights exceptions,
  `value too long for type character varying(16)`, internal route.
- Schema candidates (`migration/assets/schema/`): `120_inbound_email.sql` `body_vrm
  varchar(16)`; `050_case.sql` `vrm varchar(16)`; postcode columns elsewhere.
- A junk over-length "VRM" candidate is exactly what TKT-071's loose-shape false positives can
  produce — the two fixes are complementary (this one is the safety net).

## Proposed change

PROPOSED (not built):

- **Identify** the failing field from the 03/07 App Insights stack (KQL over exceptions joined
  to the route/operation).
- **Clamp at the mapper**: truncate the offending field(s) to the column length at the write
  seam (with a warn trace naming the field + original length), so an over-length candidate can
  never fail the row write.
- Consider clamping all sibling `varchar(16)` writes on the same seam while there (one guarded
  helper, not scattered `slice` calls).

## Acceptance

- [ ] The failing field is identified and named in [changes.md](./changes.md) with the KQL
      evidence.
- [ ] An over-length value in that field no longer fails the insert — it is truncated, the row
      lands, and a warn trace records the clamp.
- [ ] A unit test pins the clamp (over-length in → truncated out, row shape valid).
- [ ] No recurrence of `value too long for type character varying(16)` in App Insights after
      deploy (observation window recorded).

## Verification requirements (proof standard)

1. **Offline test** — mapper/unit test with an over-length value proving truncation + valid
   write shape.
2. **Gate** — `node verify-all.mjs` green; deploy recorded in [changes.md](./changes.md).
3. **Live telemetry probe** — the KQL query that found the 03/07 errors re-run post-deploy over
   a stated window showing zero new occurrences; paste query + result in
   [verification.md](./verification.md).
4. **Trace proof** — one observed (or synthetically triggered) clamp warn trace in App
   Insights, or an explicit note that no over-length value arrived during the window.

## Research

Distilled 2026-07-06 from the operator planning session `PLAN-assistant-intake-search-fixes.md`
(diagnostic summary + § 8); excerpt in [evidence/](./evidence/).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note (excerpt)](./evidence/operator-note.md)
