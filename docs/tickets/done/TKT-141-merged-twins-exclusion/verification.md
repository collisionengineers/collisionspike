# Verification — TKT-141: merged twins exclusion

## Verdict
VERIFIED-LIVE

Verified by: fresh ticket-verifier dispatch, 10-07-26, after the same-day reopen fix (retired-lock +
audited re-retire). Transcribed findings:

- **Acceptance 1 (badge=1): VERIFIED-LIVE.** Dashboard "Check the flagged details — 145" fully
  expanded contains exactly ONE PK20FWT row with NO same-VRM chip; click-through lands on survivor
  PCH26009; Not-ready filtered PK20FWT → "1 of 201". Mirror YH13ZSN: one flagged row, survivor only.
  **No over-suppression:** genuine open twins still chip (YG26OSF "3 · same VRM", YH21HZL "2").
  Screenshots (in-session ids): ss_2953xd55h, ss_3954em7py, ss_10661hs10, ss_7880lv19a.
- **Acceptance 2 (retired absent from counts, openable): VERIFIED-LIVE.** None of the three retirees
  appears in flagged/Not-ready (YH13ZSN filter → "0 of 201"); stage count 201 == queue header ==
  sidebar badge; /case/cd9092ce… and /case/d1d862bd… open directly rendering "Linked to
  instruction"; search shows the retirees as Linked-to-instruction beside the survivors.
  Handler-plain strings throughout.
- **Acceptance 3 (single-sourced count contract): VERIFIED** — the reopen fix adds no second count
  source: the retired-lock lives in the domain guard (case-status.ts:239, after the terminal-lock
  at :230) and both API recompute seams only pass the marker (cases.ts:193, internal.ts:263).
- **Acceptance 4 (verified live): YES** — observed on the deployed SPA against live data ~20 min
  after the 16:20:15Z re-retire with intake churn live.
- **Lock deployment + durability:** bundle carries the rung order (terminal → retired-lock) + both
  seam wirings; api 96 fns matches registry; domain suite 40/40 incl. the 7-test merge-retired-lock
  suite; the three delta:2026-07-10-tkt141-re-retire-merged audits are the NEWEST status events in
  the system — nothing touched the cases through ~20 min of churn. Durability caveat (not a
  failure): no read-only path can trigger a recompute, so the lock's true live exercise is the next
  organic write touch; queued SQL re-checks cheaply (Q3 strict-jsonb re-run expect 0; the 3
  casualties at 100000006; 0 status audits after 16:20:15Z).
- Notes: search "N cases share registration" counts all findable rows incl. retired — by design
  (prior adjudication stands); the w2c140b firewall rule flagged in changes.md is gone (only
  AllowAzureServices remains); az functionapp show state returns null on this CLI (use function
  list / ARM).

### Prior verdict (2026-07-10 morning sweep): FAILED (live) — reopened with a dated follow-up
([evidence/reopen-followup-100726.md](./evidence/reopen-followup-100726.md)). Root cause: TKT-131's
re-evaluate un-retired the TKT-092 merge casualties (no retired-lock existed). Fixed same day.

Verified by: ticket-verifier dispatch, 10-07-26 (verdict block transcribed 1:1 below). The exclusion
CODE is correct, deployed, and offline-proven; the live DATA regressed — the status recompute
un-retired the TKT-092 merge casualties because the guard has no retired-lock for
`duplicate_keys.mergedInto` rows. Fix direction + re-fix steps in the follow-up doc.

## Ticket-verifier verdict (transcribed 1:1, dispatch of 2026-07-10)

### Verdict
FAILED

(The decisive live artifact — the PK20FWT badge — reads **3**, not 1. Honest attribution: the
deployed TKT-141 exclusion logic is offline-proven and present in the deployed bundle, but the live
data no longer contains ANY retired-merged rows to exclude — both 2026-07-09 TKT-092 merge
retirements have been **un-retired** in the live DB since the fix, so the pinned scenario is
destroyed and lines 1–2 fail live.)

### Evidence

**Acceptance 1 — PK20FWT twin badge = 1, not 3: FAILED live.** Deployed SPA (operator session,
2026-07-10 ~16:50): Dashboard → "Check the flagged details" contains THREE PK20FWT rows, each with
chip "3 · same VRM" (screenshots ss_3810g7u3s, ss_7937s8ijx). Root cause visible on the case pages:
PCH26020 (19b96214…) and the YH13ZSN retired row (d1d862bd…) both render "Needs review" — not
"Linked to instruction". Per TKT-092's postcheck (evidence/data-fix-postcheck-2026-07-09.txt) those
exact ids were set to status_code 100000006 (linked_to_instruction) with duplicate_keys.mergedInto →
survivor PCH26009. The retirements have been reverted live; the badge counting 3 is the code
correctly counting what is now genuinely open.

**Acceptance 2 — retired rows absent from needs-action/stage counts, still openable: FAILED live
(nothing retired remains).** The formerly-retired pair is PRESENT in the needs-action list; both
YH13ZSN rows show "2 · same VRM" — the second merge pair regressed too. "Still openable directly"
held trivially but is vacuous while the rows are open. Zero currently-retired rows exist on any
readable surface, so the exclusion path is not live-demonstrable today.

**Acceptance 3 — count contract single-sourced (TKT-012): VERIFIED by code-read.** ONE predicate
`isRetiredMerged` (packages/domain/src/model/queues.ts:119-121), consumed at the server compute seam
(mappers.ts:958 filterQueue → queue lists/counts/facets/aging; dashboard.ts:157 stages;
cases.ts:725 openVrmTwins; assistant.ts:383 vrm_twins); marker surfaced once via mergedIntoFrom
(mappers.ts:241-250,307). The SPA computes nothing new. Search-page "N cases share registration" is
deliberately raw result-group size — retired-still-findable by design, not a badge.

**Acceptance 4 — verified live: NO.**

**Offline pin re-run (2026-07-10):** api dashboard.test.ts + mappers.test.ts → 46/46 (incl. the
PK20FWT-shaped suite pinning tally=1); domain queues.test.ts → 11/11. Deploy bundle carries the
logic (9 isRetiredMerged|mergedIntoFrom occurrences); wave merged via PR #52 + truth-up 996e7ba;
registry re-verified today (api 96 fns — supersedes changes.md's 94).

**Mechanism finding (real bug, for the loop):** retirement is **not durable by design**.
`linked_to_instruction` is a non-terminal branch state and the status guard recomputes from
fields/images with no knowledge of mergedInto (case-status.ts:74-76 note + statusForReviewCase
L211-234 → returns needs_review for these cases). Any touch (re-ingest, evidence event, PATCH)
silently un-retires a merged case, and the status-gated predicate goes inert. Heavy intake churn was
live during the session (Held 112→121, in-today 94→104, flagged 136→145 within minutes) — the
plausible trigger window; exact events need Q2 (queued).

### Pending / gaps
- **Real bugs:** (1) live badge = 3 vs pinned 1; (2) both TKT-092 merge retirements reverted
  post-fix (TKT-092, also in verify, is impacted — its data fix is undone); (3) durability gap: the
  status recompute can un-retire a merged case without clearing/respecting mergedInto — likely fix:
  retired-lock in statusForReviewCase when the marker is present, then re-apply the data fix.
- **Expected absences (not failures):** search listing all same-VRM rows incl. retired is by design;
  changes.md's uncommitted-on-branch claim is stale (merged via PR #52).
- DB reads queued: Q1 (the five merge-party rows' current state), Q2 (audit trail since 2026-07-09 —
  what re-opened them), Q3 (all mergedInto-marked rows with status ≠ 100000006 — the un-retired
  hybrid population). Full SQL in the follow-up doc + W2 section.

### How to re-verify
1. SQL Q1–Q3 (WSL Entra-admin path). 2. SPA signed-in: search PK20FWT → after re-fix expect ONE
needs-action row, no "3 · same VRM" chip; retired PCH rows show "Linked to instruction", absent from
Not-ready, openable directly; repeat for YH13ZSN. 3. Offline: the api + domain suites above.

### Confidence + unread surfaces
High confidence in the FAILED live state (three independent SPA surfaces agree). Unread: live DB rows
(queued); running-binary vs bundle indistinguishable with zero retired rows live; the raw
`GET /api/cases?vrm=PK20FWT&open=true` response (no standalone token); screenshots not persisted to
disk (extension disconnected at save; in-session ids recorded; re-capture is 3 clicks).

## Orchestrator data-pass W2 — RUN 2026-07-10 (~16:20 UTC, inside the re-fix window)

Q1–Q3 ran in the re-fix's single transient-FW window (WSL Entra-admin + `SET ROLE
csadmin`), BEFORE the re-retire delta, outputs saved to
[evidence/reretire-run-100726/](./evidence/reretire-run-100726)
(`pre-output-100726.txt` = Q1/Q2/Q3; `post-output-100726.txt` = post-state + parity;
`backup-prestate-100726.csv` = the pre-mutation backup; `pre.sql`/`post.sql` = the exact
queries; `delta-apply-100726.txt` = the apply transcript):

- **Q1 (five merge-party rows, pre-fix):** the three retired rows all sat at
  `needs_review` 100000002 with their `mergedInto` markers intact (updated_at
  2026-07-09 09:22:00); survivors: PCH26009 `68442a2a…` 100000003
  (missing_required_fields), YH13ZSN `be1a0a11…` 100000002 + on_hold.
- **Q2 (what re-opened them — the answer):** ONE audit row per case, all at
  **2026-07-09 09:22:00**, actor **`tkt131-image-role-backfill`** — "Status
  linked_to_instruction -> needs_review (TKT-131 image-role re-evaluate)". The TKT-131
  backfill's per-case re-evaluate un-retired them via the pre-lock recompute minutes
  after the merge delta; NOT organic intake churn.
- **Q3 (un-retired marker population):** exactly the 3 rows above — strict
  `mergedIntoFrom` semantics (valid-jsonb, non-blank marker) and the loose
  `LIKE '%mergedInto%'` count agree (3); no additional hybrids; no terminal-status
  marker-bearers.
- **Post (after the delta):** Q3 re-run = 0 rows; all three back at 100000006 with
  audits (actor `delta:2026-07-10-tkt141-re-retire-merged`, status_changed, one per
  case); openVrmTwins SQL parity **PK20FWT = 1, YH13ZSN = 1** (expected badge = 1).

## Regression verification — 2026-07-11

**Verdict: TESTED (offline) — deployment pending.**

This block supersedes the stale live/done verdict for the PR 55 migration-safety repair. The earlier
PK20FWT/YH13ZSN live correction remains valid historical evidence, but the repaired SQL has not been
run against live data.

- `2026-07-10-tkt141-re-retire-merged.sql` now uses guarded legacy-JSON parsing and accepts only a
  nonblank JSON string `mergedInto`, matching the runtime `mergedIntoFrom` contract. Invalid text and
  numeric/boolean/object/array markers cannot abort or retire a row.
- `api/src/lib/mappers.test.ts` pins valid parsed/string markers, invalid legacy text, blank strings
  and every non-string JSON shape. Domain case-status tests retain the merge-retired lock before
  ordinary readiness.
- This historical one-off data correction is not scheduled to be rerun during deployment. Release
  validation must execute/parse the repaired delta in an isolated Postgres fixture; live verification
  is limited to confirming the already-retired rows remain retired after the new runtime deploy.

## Verdict update — 2026-07-14 (independent PLAN-005 sweep; transcribed verbatim)

## Verdict

VERIFIED-LIVE

## Evidence

- **Acceptance 1 — PK20FWT active twin count is one:** In a signed-in read-only production-SPA check on
  2026-07-14, filtering the live Not ready queue for `PK20FWT` returned **1 of 435 cases**, containing only
  survivor `PCH26009`, with no same-VRM twin chip.
- **Acceptance 2 — retirees excluded from active work but directly openable:** The same filtered Not ready
  queue excluded `PCH26018` and `PCH26020`. Global search still returned all three findable PK20FWT
  records and labelled both retirees “Linked to instruction,” which is the intended search behavior.
  Direct navigation to live case `19b96214-4770-4ea7-ac56-c63741a4f430` opened `PCH26020` and rendered
  “Linked to instruction.”
- **Acceptance 3 — count contract remains single-sourced:** Current source retains one domain predicate,
  `isRetiredMerged`, at `packages/domain/src/model/queues.ts:117-128`. The API reuses it for active
  queues/counts, pipeline computation, open-VRM twins and assistant twins in
  `api/src/functions/dashboard.ts:157`, `api/src/functions/cases.ts:1343-1345` and
  `api/src/functions/assistant.ts:407-411`. The durable status lock remains before ordinary recomputation
  in `packages/domain/src/contracts/case-status.ts:428-435`.
- **Acceptance 4 — current live verification:** The observations above were made against the deployed
  production SPA and current live data on July 14, four days after the audited re-retirement.
- **Regression 1 — invalid legacy text cannot abort the delta:** The repaired SQL guards conversion with
  `pg_input_is_valid` at `2026-07-10-tkt141-re-retire-merged.sql:56-60` and `:73-77`. The July 11 release
  validation applied and replayed all deltas twice against PostgreSQL 16 successfully.
- **Regression 2 — only nonblank JSON strings retire:** The SQL requires
  `jsonb_typeof(...mergedInto) = 'string'` and a nonblank trimmed value at lines 60-61 and 77-78.
  `api/src/lib/mappers.test.ts:46-64` covers invalid text, blank strings and numeric, boolean, null, object
  and array markers.
- **Regression 3 — SQL/runtime parity:** Runtime `mergedIntoFrom` validates the same nonblank-string
  contract at `api/src/lib/mappers.ts:275-283`; mapper and domain retired-lock tests cover the matching
  shapes. The repaired API was deployed July 11 and republished in the July 12 dashboard release.
- **Historical data artifact:** The July 10 postcheck recorded zero un-retired marker rows, PK20FWT and
  YH13ZSN open-twin counts of one, and one audited re-retirement for each of the three affected rows.

## Pending / gaps

- The old “Check the flagged details” list and pipeline-stage strip no longer exist in the July 12
  dashboard design. Current proof therefore uses their replacement active-work surface, the Not ready
  queue, plus direct case access.
- No fresh Postgres `SELECT` was made because this pass could not alter the firewall. Current UI state
  nevertheless proves the retirees remain retired and excluded.
- The historical one-off re-retirement delta was intentionally not rerun during PR55 deployment; its
  repaired migration-safety behavior is fixture/replay evidence, not a second live mutation.
- No verifier-triggered recomputation was attempted because that would mutate live case state.

## How to re-verify

1. In the deployed SPA, filter Not ready for `PK20FWT`; expect one row, `PCH26009`, and no twin chip.
2. Search globally for `PK20FWT`; expect all three findable records, with `PCH26018` and `PCH26020`
   labelled “Linked to instruction.”
3. Open each retired case directly and confirm it remains accessible and retired.
4. With an already-authorized read-only database path, query all nonblank-string `mergedInto` rows; expect
   the three known retirees at `linked_to_instruction` and zero marker-bearing rows in another nonterminal
   status.
5. Re-run the isolated PostgreSQL fixture applying the repaired delta twice with invalid legacy text and
   non-string JSON marker cases.

## Confidence + unread surfaces

High confidence: fresh signed-in production UI proves the core behavior, while current source and release
records prove the durability and migration contracts. Unread surfaces are a July 14 direct database query
and an organic recomputation trace for a retired row.
