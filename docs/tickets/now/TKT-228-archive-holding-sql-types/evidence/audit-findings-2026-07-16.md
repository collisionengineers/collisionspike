# TKT-228 — distilled audit findings (2026-07-16 post-sweep three-agent audit)

Distilled from the post-sweep remediation audit of PR #102
(`feat/tkt-219-retro-parallel-reconstruction`, HEAD `e7fe2371` at audit time). This is a
**pre-existing production bug**, not a retro regression — it rides this PR's deploy train
because the operator wants the fix deployed on the open train.

## Failure signature

- ~36 failures/hr since 2026-07-16 13:00Z: `internalArchiveHoldingAdoptionCandidates` and
  `internalArchiveHoldingRegister` 500 on every call (both errors are Postgres parse/plan-time,
  so no input succeeds).
- Effect: the archive-holding recovery loop cannot register new intakes or discover adoptable
  epochs — stuck holding folders never drain into cases.

## Root causes (file/line facts re-verified against the working tree 2026-07-17; pre-fix lines)

**Bug A — text-vs-jsonb COALESCE.** `listArchiveHoldingAdoptionCaseIds`
(`services/data-api/src/features/cases/archive-holding.ts`, pre-fix line 272):

```sql
NOT (coalesce(c.duplicate_keys,'{}'::jsonb) ? 'mergedInto')
```

`case_.duplicate_keys` is **`text`** (`database/baseline/050_case.sql:39` — "JSON candidate
list (Memo 4000)"; no migration altered the type) → `COALESCE types text and jsonb cannot be
matched`. The stored value may be **free-form non-JSON**: TKT-141's re-retire migration
(`database/migrations/2026-07-10-tkt141-re-retire-merged.sql:56,73`) guards every read with
`pg_input_is_valid(c.duplicate_keys,'jsonb')`. A bare `::jsonb` cast would therefore trade a
plan-time error for a runtime one on the first non-JSON row.

**Bug B — inconsistent parameter deduction.** `registerArchiveHolding` (pre-fix lines 144-147):

```sql
INSERT INTO archive_holding_intake (holding_folder_id, source_message_id, inbound_email_id)
VALUES ($1,$2,(SELECT id FROM inbound_email WHERE source_message_id=$2 LIMIT 1))
```

`$2` deduces `character varying` from the INSERT target column and `text` from the inner `=`
comparison → `inconsistent types deduced for parameter $2`.

**Latent twins.** The identical broken coalesce appeared at seven sites (pre-fix lines 157,
272, 284, 345, 398, 427, 519) — in `registerArchiveHolding` (matching-cases),
`listArchiveHoldingAdoptionCaseIds`, `readArchiveHoldingResolution`, `resolveArchiveHolding`,
`claimArchiveHolding` (target lock + candidates), and `finalizeArchiveHolding` (case lock).
Bug B aborted the register transaction before its matching-cases SELECT executed, which is why
the line-157 twin never surfaced separately in telemetry.

## Remediation shape (decided in the approved plan)

- One exported `NOT_MERGED_INTO_SQL(col)` fragment:
  `NOT ((CASE WHEN col IS NOT NULL AND pg_input_is_valid(col,'jsonb') THEN col::jsonb ELSE
  '{}'::jsonb END) ? 'mergedInto')` — validity-guarded, replaces all seven occurrences.
  `pg_input_is_valid` already ships in runtime data-api SQL
  (`services/data-api/src/shared/mapping/cases.ts:31`), proving live-server support.
- Bug B: cast BOTH `$2` references `::text`.
- Tests: behavioural SQL capture on the mocked-`tx` harness plus a module-source pin
  (zero broken-pattern matches, seven fragment usages).

## Related tickets

- TKT-034 (archive-holding system), TKT-141 (duplicate_keys free-form tolerance +
  `pg_input_is_valid` precedent).
