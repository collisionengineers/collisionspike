# Changes — TKT-012: Define the combined dashboard/queue count contract

## Status
done

## Commits
- `94902ce` — work-todo-spike mega-commit (TKT-001..014,019,020) → pinned a single dashboard/queue count contract joining the case pipeline with inbound-email triage, and split lifetime-vs-windowed count semantics so stage counts and queue counts are consistent.

## Files touched
- `api/src/functions/dashboard.ts` (+ `dashboard.test.ts`)
- `api/src/lib/mappers.ts` (+ `mappers.test.ts`)

## Summary
The dashboard count logic was under-specified — stage counts and queue counts diverged and clicks landed on broader queues. This ticket defined one contract: a clear split between lifetime (cumulative) and windowed (today/this-week) counts, with the queue mapping made explicit. Covered by unit tests in the Data API.
