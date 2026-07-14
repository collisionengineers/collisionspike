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

### W6 data-pass results (orchestrator-run, 2026-07-10 — the queued SQL)
- Q1: 3 merges, all delta-stamped (`delta:2026-07-09-intake-wave-data-fixes`), **every survivor
  has_wp=true and every retired side has_wp=true** — no provider was lost in the data-fix merges.
- Q2: the 3 matching `Merged …` audits (PCH26020/PCH26018 → PCH26009; the QCL 226070.TA pair).
- Q3: 0 fill-branch provenance rows — as expected (the route fill has never executed).
- Q4: both survivors carry providers — PCH26009 → "Performance Car Hire"; be1a0a11 → QCL. The
  changes.md `providerPreserved` claim is now closed by direct column read.
The verdict stands PENDING on the route-level live merge (UI-unreachable for the fill scenario —
see the dialog-filter follow-up).

## Regression verification — 2026-07-11

**Verdict: TESTED (offline) — deployment pending.**

This block supersedes the earlier live/deployed verdicts for the PR 55 regression repair, including
the old statement that the provider-fill path was UI-unreachable.

- Merge-candidate eligibility now allows a pair when either side is providerless and still excludes
  two known, different providers. The staff dialog can therefore reach the safe provider-fill path.
- Both UUIDs are validated and canonicalised before self-checks, row/advisory locks, provider choice
  and response construction. The provider and its provenance are carried inside the merge
  transaction; the survivor's status generation is requested there as well, while immediate
  recomputation is an optional fast path.
- `api/src/functions/cases-merge.test.ts` covers providerless candidate reachability, exclusion of a
  different known provider, mixed-case UUID carry-over, case-insensitive self-merge refusal, ordered
  locking and a post-commit fast-path failure that leaves the durable generation pending without
  reporting a false merge failure.
- Live proof still required: deploy the repaired API/SPA and perform one provider-bearing →
  providerless merge from the dialog, then verify the survivor provider/provenance and status drain.

## Verdict update — 2026-07-14 (independent PLAN-005 sweep; transcribed verbatim)

## Verdict

PENDING

## Evidence

- Current clean `main` is `308294c`; the repaired PR 55 release was recorded deployed on 11 July.
- Fresh live function inventory lists both `mergeCandidates` and `mergeCases`.
- Post-rollout App Insights evidence shows one successful `mergeCandidates` request on 13 July, but **zero
  `mergeCases` requests**.
- Targeted tests passed: 51/51 API tests across merge, key-authentication, and validation files; plus 22/22
  domain dedup tests. Coverage includes providerless candidates, provider carry-over, UUID canonicalisation,
  ordered locking, durable status recomputation, and cross-provider refusal.
- ADR-0010 and the ticket screenshot were reviewed. Current source permits a providerless/provider-bearing
  pair while still excluding two differing known providers.

## Pending / gaps

- No real post-fix merge proves the survivor retained `work_provider_id`, `eva_work_provider`, and provider
  provenance.
- No live `providerFilled: true` audit or completed survivor status recomputation exists.
- Direct Postgres verification was unavailable without changing the firewall; no firewall change was made.
- App Insights sampling means zero observed requests is not absolute proof of no execution, but it supplies
  no positive closure evidence.

## How to re-verify

Wait for a genuine staff-selected provider-bearing/providerless merge. Verify the `mergeCases` 200 request,
survivor provider fields, provenance row, `providerFilled: true` audit, moved evidence/emails, retired source
lineage, and drained status-recompute generation. Do not create a disposable case solely for proof.

## Confidence + unread surfaces

High confidence that the repaired code and routes are deployed and offline-covered; high confidence that
live closure is not currently proven. Unread surfaces: live Postgres rows and any sampled-out request
telemetry.
