# Changes — TKT-148: Targeted overview-photo chaser for cases whose photo sets genuinely lack a vehicle overview

## Status
now — detector shipped live on `cespk-api-dev` (2026-07-10) inside both status-recompute
seams; api suite 412 green; one-shot pass minted 31 drafted suggestions (A.QDOS26029
included); awaiting live-proof pass (JSON read seam / SPA render) before `verify`→`done`.

## Commits
- ONE commit on `feat/backlog-drain` (hash in the dispatch return report / `git log
  --follow` on `services/data-api/src/features/cases/overview-chase.ts`) — detector + seam wiring + tests + bundle
  + these ticket artifacts. It also CARRIES the dispatching loop's already-staged ticket
  folder moves (TKT-146 now→verify, TKT-148 backlog→now, BOARD/README rows): the
  pre-commit doc gate enumerates the commit's index and crashes on half-committed folder
  moves, so the tickets subtree had to land atomically with it. The moves themselves were
  made by the dispatching loop's ticket-move script, not by this implementation.

## Files touched
- `services/data-api/src/features/cases/overview-chase.ts` (NEW) — the detector: pure predicate + guarded mint.
- `services/data-api/src/features/cases/overview-chase.test.ts` (NEW) — 17 offline tests (predicate boundaries,
  mint shape, idempotency, advisory never-throws, handler-plain copy).
- `services/data-api/src/features/cases/` — staff-side `recomputeStatus` now runs the detector on
  EVERY evaluation (the early return on unchanged status became a conditional block —
  a merge can add photos while the status stays `missing_images`).
- `services/data-api/src/features/` — internal `recomputeStatus` (the orchestration
  status-evaluate seam the TKT-146 classify sweep re-invokes per stamped case) runs the
  detector too.
- `docs/tickets/done/TKT-148-overview-photo-chaser/{changes,verification}.md` + `evidence/`
  (one-shot-run.md, one-shot-backup-candidates.csv, one-shot-minted.csv).

## Summary
Post-classification, a case can hold a healthy photo set that genuinely lacks a vehicle
overview (A.QDOS26029: 8 accepted photos, all damage close-ups) — honestly stuck at
`missing_images`; the fix is a real photo from the customer. The detector rides the
existing status-evaluate seam (both recompute implementations), so a case is re-examined
exactly when its photo set or fields change — including at event time via the TKT-146
sweep's per-case `status-evaluate` re-invoke. When the predicate holds it mints ONE
drafted, staff-sent chase suggestion (never sends — ADR-0003 draft-only; no Graph, no new
outbound path) plus one `chaser_sent` audit row. A one-shot SQL-parity pass covered the
existing backfilled corpus: 31 cases, 31 drafted chases, backup CSV before minting.

## Decisions of record
- **N = 5** (`OVERVIEW_CHASE_MIN_ACCEPTED_IMAGES`, code constant in
  `services/data-api/src/features/cases/overview-chase.ts`) — minimum accepted photos before an overview-less set
  is chased.
- **Overview candidate = accepted, non-excluded image with role `overview`, regardless of
  `registration_visible`** (the ticket-brief letter: "zero overview-role candidates"). A
  photo classified overview but with unconfirmed registration is a review problem, not a
  customer-chase problem. (For the record, every one-shot candidate had zero overview-role
  photos under either reading — `overview_reg_count` was also 0 across the set.)
- **Still-unclassified guard**: any non-excluded image with role `unknown` AND
  `registration_visible IS NULL` (the TKT-131 predicate) holds the chase off — prevents
  false chases while the TKT-146 sweep drains. Proven live: 4 cases blocked at recon
  became honest candidates 25 min later once the sweep classified them.
- **Idempotency semantics (recorded per the brief)**: at most ONE system suggestion per
  case, EVER — the single-statement `INSERT … WHERE NOT EXISTS` blocks when (a) any chaser
  with `template_used = 'Overview photo request'` exists in ANY status, or (b) any OPEN
  chaser (drafted/sent/overdue) of any template exists (staff already chasing — don't pile
  on). **No automatic re-mint after a responded chase**: `markOutstandingChasersResponded`
  marks chasers responded on ANY email attach, so auto-re-mint would mint a new row per
  unrelated attach; repeat chases stay a human call via the existing chaser panel.
- **Status scope**: never on a terminal status (`eva_submitted`/`box_synced`/`error`/
  `removed`/`done`) nor `linked_to_instruction` (retired merged duplicate).
- **Advisory**: the detector never throws — every failure path returns false so a
  suggestion hiccup can never sink the status recompute hosting it.
- **Staff-visible copy** (handler-plain, no engineering language): chaser summary
  "Suggested chase — ask for a photo of the whole vehicle showing the registration plate
  clearly."; template label "Overview photo request" (reads like the existing chaser
  register labels); audit line "Chase suggested (Overview photo request) — drafted for
  staff to send". No note row is written — the chase row (case JSON `chasers[]`), the
  queue "Last update" label and the case activity feed are the existing surfaces; the
  Notes tab stays staff-authored space.
- **One-shot mechanism**: SQL-parity admin window (TKT-131/133 precedent) rather than
  driving the deployed seam per case — the workstation cannot mint an API-audience token
  (az CLI AADSTS65001, recorded in the postgres playbook memory). The SQL reproduces the
  deployed predicate/guard/row/audit exactly; single deliberate delta = the
  `"oneShot":"TKT-148"` marker in the audit `after` JSON. Idempotent both ways: the pass
  re-run finds 0 candidates, and the deployed detector's guard skips every minted case.

## Deploys
- `cespk-api-dev` 2026-07-10: bundle rebuilt (`npm run build --prefix api` →
  `node scripts/build/build-api.cjs` → `npm install --prefix .artifacts/deploy/data-api --omit=dev` → local
  `require(main.cjs)` smoke → `func azure functionapp publish` from Windows).
  Function count 96 (unchanged), state Running, no-auth 401, App Insights clean
  (94×200 + 5×204, zero exceptions in the 15-min window). No orch change (the detector is
  api-side; the orch already re-invokes status-evaluate). No app-settings/gates changed
  (N is a code constant) → LIVE_FACTS untouched (counts/settings identical).

## Out-of-scope discoveries
- The SPA's Chasers tab renders the composer only; persisted chaser rows surface via the
  case JSON (`chasers[]`), the queue "Last update" label ("Chased") and the activity feed —
  there is no chase-HISTORY list in CaseDetail. Same rendering for staff-logged and
  system-suggested rows (no regression), but a dedicated drafted-suggestion affordance
  would be a UI follow-up ticket.
- The queue "Last update" label for any chaser row reads "Chased" (lib/last-activity.ts)
  even while the row is a drafted suggestion nobody has sent — pre-existing wording seam
  shared with staff-drafted rows; a status-aware label ("Chase drafted") would need the
  lateral join to carry chaser status. Left untouched (wider blast radius than this
  ticket).
- 7 cases still hold still-unclassified photos (post one-shot) — mostly recent arrivals
  inside the sweep's window, but any email-lane stragglers are NOT covered by the
  box-lane-only TKT-146 sweep and would need a TKT-131-style backfill to unblock the
  detector for those cases.

## Regression follow-up

- [2026-07-11 concurrency-safe drafts and honest activity wording](./changes-regression-11-07-26.md)
