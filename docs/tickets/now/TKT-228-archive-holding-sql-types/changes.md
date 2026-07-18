# Changes — TKT-228: Archive-holding recovery loop 500s on two Postgres type bugs

## Status

now — code + offline tests complete on `feat/tkt-219-retro-parallel-reconstruction`; rides
PR #102's deploy train (data-api lane).

## Commits

- (pending) — committed by the dispatching session together with the rest of the post-sweep
  remediation batch; this ticket's diff is the two files below.

## Files touched

- `services/data-api/src/features/cases/archive-holding.ts` —
  - new exported `NOT_MERGED_INTO_SQL(col)` fragment (validity-guarded `pg_input_is_valid`
    CASE, never a bare `::jsonb` cast — `duplicate_keys` is TEXT and may hold non-JSON per
    TKT-141); all SEVEN broken `coalesce(duplicate_keys,'{}'::jsonb)` occurrences replaced
    (`duplicate_keys` × 6, `c.duplicate_keys` × 1);
  - Bug B: the `archive_holding_intake` INSERT now casts BOTH `$2` references `::text`
    (`VALUES ($1,$2::text,(SELECT id FROM inbound_email WHERE source_message_id=$2::text
    LIMIT 1))`), with a comment carrying the varchar-vs-text deduction root cause.
- `services/data-api/src/features/cases/archive-holding.test.ts` — new
  `TKT-228 — Postgres type-safety regressions` describe block: module-source pin (zero
  broken-pattern matches, exactly seven `NOT_MERGED_INTO_SQL` usages, exact fragment text),
  adoption-candidates SQL capture (guard present, broken coalesce absent), register-path SQL
  capture (`$2::text` twice, whole transaction free of the broken pattern, matching-cases
  probe guarded).

## Summary

Two plan-time Postgres type errors 500ed the archive-holding recovery loop on every call since
2026-07-16 13:00Z (~36 failures/hr): a `text`-vs-`jsonb` COALESCE on `case_.duplicate_keys`
(which may legitimately hold non-JSON — TKT-141) and mixed varchar/text deduction for `$2` in
the intake INSERT. The COALESCE existed at seven sites; all now route through one exported,
validity-guarded fragment, and the INSERT casts both parameter references. Bug B masked Bug A's
same-transaction twin (register's matching-cases SELECT never ran). Pre-existing production bug
riding PR #102's train — not a retro regression.
