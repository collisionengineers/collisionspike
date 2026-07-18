---
id: TKT-228
title: Archive-holding recovery loop 500s on two Postgres type bugs
status: now
priority: P1
area: archive
tickets-it-relates-to: [TKT-034, TKT-141]
research-link: docs/tickets/now/TKT-228-archive-holding-sql-types/evidence/audit-findings-2026-07-16.md
---

# Archive-holding recovery loop 500s on two Postgres type bugs

## Problem

This is a **pre-existing production bug unrelated to the retro work**: it rides PR #102's open
deploy train (`feat/tkt-219-retro-parallel-reconstruction`) because the operator wants the
remediation deployed, not because it is a retro regression. It has produced ~36 failures/hr
since 2026-07-16 13:00Z.

Both bugs live in `services/data-api/src/features/cases/archive-holding.ts` and are
parse/plan-time errors, so the affected routes 500 on **every** call:

- **Bug A** (`internalArchiveHoldingAdoptionCandidates` → `listArchiveHoldingAdoptionCaseIds`):
  `NOT (coalesce(c.duplicate_keys,'{}'::jsonb) ? 'mergedInto')`. `case_.duplicate_keys` is
  **`text`** (`database/baseline/050_case.sql:39`; no migration altered it) →
  `COALESCE types text and jsonb cannot be matched`. The value may be **free-form non-JSON**
  (TKT-141's migration guards with `pg_input_is_valid`), so a naive `::jsonb` cast is NOT safe.
- **Bug B** (`internalArchiveHoldingRegister` → `registerArchiveHolding`):
  `VALUES ($1,$2,(SELECT id FROM inbound_email WHERE source_message_id=$2 LIMIT 1))` — `$2`
  deduces `character varying` from the INSERT target and `text` from the `=` comparison →
  `inconsistent types deduced for parameter $2`.
- **Latent twins**: the same broken `coalesce(duplicate_keys,'{}'::jsonb)` appeared at SEVEN
  sites across the module (register matching-cases, adoption candidates, resolution read,
  staff resolve, claim target + candidates, finalize lock). All seven are in scope.

Consequence: stuck holding epochs never adopt, registrations defer forever, and the recovery
monitor burns retries. Distilled audit findings:
[evidence/audit-findings-2026-07-16.md](./evidence/audit-findings-2026-07-16.md).

## Change

1. **One shared guard fragment**, exported for the pinning test:

   ```ts
   /** duplicate_keys is TEXT and may hold non-JSON (TKT-141); never coalesce it against a jsonb literal. */
   export const NOT_MERGED_INTO_SQL = (col: string): string =>
     `NOT ((CASE WHEN ${col} IS NOT NULL AND pg_input_is_valid(${col},'jsonb') THEN ${col}::jsonb ELSE '{}'::jsonb END) ? 'mergedInto')`;
   ```

   All seven occurrences route through it (`duplicate_keys` × 6, `c.duplicate_keys` × 1).
   `pg_input_is_valid` is already used by runtime data-api SQL
   (`services/data-api/src/shared/mapping/cases.ts:31`), so live-server support is proven. A
   bare `::jsonb` cast is forbidden — `duplicate_keys` can hold non-JSON.
2. **Bug B exact fix** — cast BOTH `$2` references so one type is deduced:
   `VALUES ($1,$2::text,(SELECT id FROM inbound_email WHERE source_message_id=$2::text LIMIT 1))`.
   Note: Bug B failed the register transaction before its matching-cases SELECT ran, masking
   Bug A's twin in the same function.

## Acceptance

1. The module's emitted SQL contains no `coalesce(duplicate_keys,'{}'::jsonb)` (any prefix
   form); the adoption-candidates SQL carries the `pg_input_is_valid` guard; the register
   INSERT carries `$2::text` twice (behavioural tests on the mocked-`tx` harness).
2. A module-source-level pin proves zero matches of the broken pattern and exactly seven
   `NOT_MERGED_INTO_SQL` usages (the `archive-holding-schema.test.ts` file-pinning precedent).
3. All archive-holding tests green; `npm run build:api` clean.
4. Post-deploy: `requests | where name in ("internalArchiveHoldingAdoptionCandidates",
   "internalArchiveHoldingRegister") | summarize count() by name, resultCode` → zero 500s; the
   36/hr failure signature disappears; stuck holding epochs drain.

## Research

Root cause established by the 2026-07-16 post-sweep three-agent audit of PR #102's train; the
distilled note is banked at
[evidence/audit-findings-2026-07-16.md](./evidence/audit-findings-2026-07-16.md) (App Insights
free-tier telemetry is perishable — re-run the KQL same-day after deploy).

## Artifacts

- [Changes made](./changes.md)
- [Verification record](./verification.md)
