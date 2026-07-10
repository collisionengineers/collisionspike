# Verification — TKT-052: Merged image-only case loses the provider

## Verdict
**PENDING** (2026-07-10, ticket-verifier dispatch) — deployed + offline-proven; **no live merge has
ever executed through the route**, and the shipped fill branch is currently **UI-unreachable** for
the exact operator scenario (see the real finding below).

## Sweep verdict (transcribed verbatim, 2026-07-10)

Acceptance letter (spec has no formal Acceptance header; binding lines = Problem + Notes: *"the
merge must prefer whichever side carries a resolved provider, with provenance"*, under the ADR-0010
cross-provider refusal):

- **A1 — survivor ends with whichever side carries a resolved provider:**
  `packages/domain/src/domain/dedup.ts:255-265` `decideMergeProvider` (source-only → fill survivor;
  target-known → keep; neither → null) wired into `api/src/functions/cases.ts:940-979` (guarded
  `UPDATE … WHERE work_provider_id IS NULL`, `eva_work_provider` fill-if-empty, audit `after`
  records `movedEmails` + `providerFilled`). Offline: dedup.test.ts **22/22** (re-run this session,
  incl. the 4 TKT-052 branches). Deployed since `39133ff` (2026-07-09); live app lists `mergeCases`
  + `mergeCandidates`. **Live proof: NONE EXISTS** — KQL 90d: **0 `mergeCases` POSTs ever**; 6
  `mergeCandidates` GETs (dialog opens, no merge). DB marker census (banked TKT-141 evidence,
  2026-07-10T16:20Z): the entire `mergedInto` population is 3 rows, all
  `mergedBy: delta:2026-07-09-intake-wave-data-fixes` — zero route-stamped markers.
- **A2 — provenance:** `cases.ts:966-977` inserts `field_level_provenance`
  (`'Carried over from the merged case'`) on fill. Zero fills executed live → zero rows expected
  (queued Q3 checks).
- **A3 — cross-provider refusal intact:** `cases.ts:915-917` 400 refusal untouched;
  `decideMergeProvider` re-asserts (`crossProvider: true` blocks the fill); unit-pinned. No live
  400s to cite (route never called).
- **Data-fix merges:** the 2026-07-09 delta wrote `providerPreserved: true` audits for survivors
  `68442a2a` (PCH26009) + `be1a0a11`, but the banked evidence never selected `work_provider_id` —
  queued Q4 closes it with a column read.

### Real finding for the dispatching loop (reachability, not a merge-logic failure)
The SPA `MergeCaseDialog` is the **only** live caller, and its candidate filter
(`cases.ts:890`: `cc.providerCode === self.providerCode`, `''` when unset) excludes mixed pairs
**in both directions** — a provider-less case and a provider-bearing case never appear in each
other's candidate lists. The dialog filter is stricter than the API's own ADR-0010 rule (refuse only
when *both* providers are known and differ), so the shipped fill branch is **UI-unreachable for the
exact operator scenario** until staff first assign a provider to the image-only side (at which point
no fill is needed) or a non-UI caller merges. → Follow-up-ticket candidate (relax the dialog filter
to the ADR-0010 rule).

### Pending / gaps
The precise missing event: a live `POST /api/cases/{tgt}/merge` where the survivor has
`work_provider_id IS NULL` and the retired source carries one (`providerFilled: true` audit + one Q3
provenance row). Per the finding above this cannot currently arise via the UI.

### Queued SQL (next data pass)
Q1 merge census with provider carry (bug signature = route-stamped survivor NULL + retired
non-NULL); Q2 `Merged %` audit events; Q3 fill-provenance rows (expect 0 today); Q4 the two data-fix
survivors' provider columns. Full statements in the sweep record (this file's history) — Q1–Q4 as
returned by the verifier.

### How to re-verify
KQL `mergeCases`/`mergeCandidates` over 90d (`--offset 90d`); dedup.test.ts 22/22 offline; after any
suspected merge, Q1/Q3.

Verified by: ticket-verifier dispatch, 2026-07-10.
