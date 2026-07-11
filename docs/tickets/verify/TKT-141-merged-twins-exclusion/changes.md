# Changes — TKT-141: merged twins exclusion

## Status
REOPEN FIX built + deployed + data re-applied (2026-07-10, see the dated section below);
awaiting fresh verification (verdict PENDING). The original exclusion build (below) was
merged via PR #52; its "uncommitted" line is historical.

## 2026-07-10 — reopen fix: retired-lock + audited re-retire

### Root cause (verified from the append-only audit trail, not hypothesis)
The 2026-07-09 merge retirements were un-retired at **2026-07-09 09:22:00** by actor
**`tkt131-image-role-backfill`** — "Status linked_to_instruction -> needs_review (TKT-131
image-role re-evaluate)" — one audit row per case (Q2, [evidence/reretire-run-100726/pre-output-100726.txt](./evidence/reretire-run-100726/pre-output-100726.txt)).
The TKT-131 image-role backfill re-invoked the internal status re-evaluate per stamped
case minutes after the merge delta ran; the pre-lock `statusForReviewCase` recomputes
from fields/images with no knowledge of `duplicate_keys.mergedInto`, so the three
merge-retired rows flipped back to `needs_review` and the status-gated `isRetiredMerged`
exclusion went inert (the verifier's "intake churn" hypothesis was close but the actual
trigger was the TKT-131 sweep). The exclusion code itself was and is correct.

### The retired-lock (domain)
`packages/domain/src/contracts/case-status.ts` — `StatusEvaluationInput` gains an
optional `mergedInto?: string`; `statusForReviewCase` adds one rung **after the
terminal-lock, before every recompute branch**:

- marker present (non-blank trimmed) → return `'linked_to_instruction'` — the recompute
  **preserves** a retired case AND **converges** a wrongly un-retired marker-bearing case
  back to retired (self-heal; the only writer of the marker is the merge path, which sets
  `linked_to_instruction` atomically, and there is no unmerge);
- terminal statuses still win above it (a stale marker never rewrites `removed`/`done`);
- no marker → behaviour unchanged (a plain `linked_to_instruction` partial still
  recomputes once its fields/images resolve — no over-lock).

Wired at both recompute seams that evaluate an EXISTING case (`api/src/functions/cases.ts`
`recomputeStatus`, `api/src/functions/internal.ts` `recomputeStatus` — both build the
input from `rowToCase`, which surfaces the marker via `mergedIntoFrom`). Case-create
seams (`createCase`, provider-intake) have no marker by construction. The orchestration
app does NOT embed the recompute (its `statusEvaluate` activity calls the Data API
internal route), so only the API needed deploying.

### Tests (offline pins)
- `packages/domain/src/contracts/case-status.test.ts` — new "merge-retired lock
  (TKT-141)" suite, 7 tests: preserve on the fields+images-pass shape; preserve on the
  evidence-less shape (the live regression shape); self-heal convergence
  (needs_review+marker → linked_to_instruction); blank/whitespace marker = no marker;
  non-merged linked case still recomputes to ready_for_eva AND to its pending branch
  (no over-lock); terminal-beats-marker (removed/done).
- Suites green: **domain 1083** (50 files), **api 412** (39 files) — includes the
  original TKT-141 exclusion suites and the TS↔Python readiness parity gate (its
  fixtures carry no marker; the lock is invisible to it).

### Deploy evidence (2026-07-10)
- Bundle: `npm run build --prefix api` (tsc) → `node build-api.cjs` → prod `node_modules`
  → smoke `require('./main.cjs')` registers **96** functions; bundle greps confirm the
  lock expression (`input.mergedInto ?? ""`) and BOTH seam wirings
  (`mergedInto: full.mergedInto` ×2).
- `func azure functionapp publish cespk-api-dev --javascript` (Windows func) — publish
  listed the routes; post-deploy: function counts **api 96 / orch 74** (unchanged, orch
  not deployed), ARM `properties.state` = **Running**, unauthed probe → **401**,
  App Insights (20 min): 0 failed requests / 0 exceptions. Registry untouched (no
  count/setting change).

### Audited re-retire (data, one transient-FW window 2026-07-10 ~16:20 UTC)
Delta: [`migration/assets/schema/deltas/2026-07-10-tkt141-re-retire-merged.sql`](../../../../migration/assets/schema/deltas/2026-07-10-tkt141-re-retire-merged.sql)
(backup-first, audited, idempotent, terminal-respecting; applied as `SET ROLE csadmin`
AFTER the lock deployed). Run record in
[evidence/reretire-run-100726/](./evidence/reretire-run-100726) (pre/post SQL + outputs
+ pre-state CSV):
- **Q1/Q2/Q3 (the verifier's queued W2 pass) run first and saved.** Q3 population =
  exactly the 3 known rows (strict jsonb semantics == loose LIKE == 3; no other hybrids;
  whole marker population count 3, all status 100000002).
- Backup: `backup-prestate-100726.csv` (3 rows, the mutated columns) + in-DB full-row
  jsonb snapshots in `backup_20260710_tkt141_reretire` (3).
- Re-retired **3** rows → status_code 100000006, on_hold false; **3** audit_event rows
  (status_changed 100000013, actor `delta:2026-07-10-tkt141-re-retire-merged`, one per
  case, before/after codes recorded). Post Q3 re-run = **0 rows**.
- openVrmTwins SQL parity: **PK20FWT open twins = 1** (survivor PCH26009 `68442a2a…`),
  **YH13ZSN open twins = 1** (survivor `be1a0a11…`) → expected badge = 1 (no
  "3 · same VRM" chip; a single open case renders no twin alarm).
- Transient firewall rule `tkt141-reretire-100726` trap-deleted. NOTE: a pre-existing
  rule `w2c140b` (82.8.225.120, another session's W2 window) remained — not created and
  deliberately not deleted by this pass; flagged to the orchestrator.

### Commits
(recorded on `feat/backlog-drain`; see git log — the commit also carries the
orchestrator's staged TKT-144 verify→done ticket-move, disclosed per the known
pathspec/doc-gate interaction.)

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

## Regression follow-up

- [2026-07-11 safe merge-marker migration](./changes-regression-11-07-26.md)
