# Changes — TKT-141: merged twins exclusion

## Status
built + deployed (2026-07-09, PLAN-003 final wave D1: api republished 94, SPA redeployed)
— uncommitted on `feat/final-wave`; awaiting the PK20FWT live badge check.

## Commits
(none yet — the wave's work is uncommitted on `feat/final-wave` per the dispatch instructions)

## Files touched
- `packages/domain/src/model/queues.ts` — **the ONE predicate** `isRetiredMerged(c)`:
  `status === 'linked_to_instruction' && mergedInto present`. A plain
  `linked_to_instruction` case (no marker) keeps its historical partial-joined meaning
  and still counts as Not-ready. (Count contract stays single-sourced — TKT-012.)
- `packages/domain/src/model/types.ts` — `Case.mergedInto?: string` (the TKT-092
  survivor marker, surfaced from dedup staging).
- `api/src/lib/mappers.ts` — `mergedIntoFrom(duplicate_keys)` (tolerant JSON parse of the
  merge marker TKT-092 writes; legacy candidate-list values → undefined) wired into
  `rowToCase`; **`filterQueue` excludes retired merged cases** — this one seam covers the
  queue LIST route, `computeLiveCounts`, `computeQueueCounts`, `computeReasonFacets`, and
  `computeAgingExceptions`/`actionableCases` (the needs-action/attention set the
  dashboard's same-VRM twin badge is derived from).
- `api/src/functions/dashboard.ts` — `computePipelineStages` skips retired merged cases
  (the Not-ready stage count).
- `api/src/functions/cases.ts` — `openVrmTwins` (`GET /api/cases?vrm=…&open=true`) filters
  them exactly like the terminal set (CaseList/CasePeekDrawer twin counts).
- `api/src/functions/assistant.ts` — the `vrm_twins` assistant tool applies the same
  predicate, so the assistant's twin count agrees with the SPA badge.
- Tests: `packages/domain/src/model/queues.test.ts` (+`isRetiredMerged` suite),
  `api/src/lib/mappers.test.ts` (+`mergedIntoFrom` + `rowToCase.mergedInto` suites),
  `api/src/functions/dashboard.test.ts` (+TKT-141 suite: a PK20FWT-shaped survivor + two
  retired rows + an un-marked linked case — queue lists/live counts/aging rows/stage
  counts all drop exactly the retired pair; the aging-row same-VRM tally for PK20FWT
  computes 1).

## Summary
Merge-retired duplicates (`linked_to_instruction` + `mergedInto`) no longer count
anywhere staff read "open work": twin badges, needs-action/attention lists, queue lists,
live/queue counts, and the pipeline-stage strip — all via one domain predicate consumed
at the server-side single-source compute layer (nothing new computed in the SPA). They
stay openable directly (single-case reads and global search are untouched — a retired
case remains findable, rendering its "Linked to instruction" badge). Suites: domain 1061,
api 352 — green.
