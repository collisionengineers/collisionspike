# Verification — TKT-141: merged twins exclusion

## Verdict
FAILED (live) — reopened to `now` 2026-07-10 with a dated follow-up
([evidence/reopen-followup-100726.md](./evidence/reopen-followup-100726.md)).

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

## Orchestrator data-pass W2 — pending

Q1–Q3 run in the W2 batched window (before the re-fix dispatch); results appended here.
