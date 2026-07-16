# Verification — TKT-148: Targeted overview-photo chaser for cases whose photo sets genuinely lack a vehicle overview

## Verdict
VERIFIED-LIVE

Verified by: ticket-verifier dispatch, 10-07-26 (verdict block transcribed 1:1 below; orchestrator
data-pass W1 results appended).

## Evidence
- Offline: `services/data-api/src/features/cases/overview-chase.test.ts` — 17 tests (predicate boundaries at N=5,
  zero-overview / zero-unclassified legs, terminal/retired exclusion, mint row shape +
  audit, lost-guard idempotency, advisory never-throws, handler-plain copy); api suite
  39 files / 412 tests green; `tsc -b` green.
- Live (DB layer): [evidence/one-shot-run.md](./evidence/one-shot-run.md) — 31 candidates,
  31 drafted chases + 31 audit rows minted 2026-07-10, 0 candidates remaining;
  **A.QDOS26029 chaser `93dfcb3a-695e-421c-ba44-143e27ddce3c`** (drafted, template
  "Overview photo request"); negative control A.PCH26008 (4 overview candidates) has 0
  chaser rows. Backup CSV captured before minting.
- Deploy: cespk-api-dev publish 2026-07-10, 96 functions, Running, no-auth 401,
  App Insights zero exceptions in the 15-min post-deploy window.

## Pending / gaps
- **Acceptance line 2 ("A.QDOS26029 surfaces one (live)") is proven at the DB + mapper
  layer, not yet through the deployed JSON read seam** — the workstation cannot mint an
  API-audience token (AADSTS65001), so `GET /api/cases/ac34fae6-…` / the SPA Chasers
  surface needs a signed-in check (verifier with SPA access, or the operator).
- The deployed detector has not yet been observed minting ORGANICALLY (the one-shot
  pre-empted the whole current corpus — by design). The next genuinely-new overview-less
  case (or a sweep-drained one) is the organic proof.

## How to re-verify
1. As a signed-in staff user (or ticket-verifier via the SPA/chrome-devtools): open case
   A.QDOS26029 (`ac34fae6-1b6f-4af6-b296-660d53631577`) — case JSON `chasers[]` contains
   one `status: 'drafted'`, `templateUsed: 'Overview photo request'` row with summary
   "Suggested chase — ask for a photo of the whole vehicle showing the registration plate
   clearly."; the case list "Last update" shows the chase activity.
2. DB spot-check (WSL Entra-admin + `SET ROLE csadmin`, transient firewall rule):
   `SELECT count(*) FROM chaser WHERE template_used = 'Overview photo request'` → 31 (or
   more, if the deployed detector has minted organically since);
   `... audit_event WHERE action_code = 100000023 AND after LIKE '%"oneShot": "TKT-148"%'`
   → exactly 31 (one-shot rows only).
3. Idempotency live: POST a no-op edit / re-run status-evaluate on A.QDOS26029 — no second
   suggestion row appears (guard: template exists).
4. Negative control: A.PCH26008 (`cd9b6a97-aa6e-426a-be17-91d0d3a0e066`) still has 0
   chaser rows unless staff logged one manually.
5. Organic-path watch: App Insights (cespk-api-dev) — audit writes with summary
   "Chase suggested (Overview photo request)" WITHOUT the oneShot marker = the deployed
   detector firing. **Verifier correction:** the chase audit emits NO AppTraces signal
   (DB-only write) — use the organic-mint SQL (query e below) instead of App Insights.

---

## Ticket-verifier verdict (transcribed 1:1, dispatch of 2026-07-10)

### Verdict
VERIFIED-LIVE

### Evidence
**Acceptance line 1 — "Cases with >=N accepted photos and zero overview candidates surface a
suggested overview chase (draft, staff-sent)":**
- **Code-read (deployed source + bundle):** `services/data-api/src/features/cases/overview-chase.ts` — predicate exactly N=5
  (`OVERVIEW_CHASE_MIN_ACCEPTED_IMAGES=5`), zero accepted overview-role photos, zero still-unclassified
  (TKT-131 predicate), non-terminal + not `linked_to_instruction`. Idempotency = single-statement
  `INSERT … WHERE NOT EXISTS` (blocks on template-ever-exists OR any open chaser); draft-only (no
  status_code in the INSERT → DB default drafted; no sent_by/sent_at); whole function try/catch →
  return false (advisory never-throws). **No sendMail/send path exists anywhere in services/data-api/src (grep: zero
  matches).** Both seams wired, detector runs on EVERY evaluation outside the changed-status
  conditional: cases.ts:209 and internal.ts:281. The built bundle carries the template string.
- **Offline proof re-run by the verifier:** `npm --prefix services/data-api test -- src/features/cases/overview-chase.test.ts`
  → 17/17 passed (2026-07-10 14:29).
- **Live SPA (verifier's own read-only session via the operator's signed-in Chrome, own tab):**
  Not-ready queue renders A.QDOS26062 — "Chased · 10/07/2026" (one of the 31 minted); Review queue
  search "PCH26008" renders minted PCH26008 (YH21HZL) — "Chased · 10/07/2026" beside un-minted
  A.PCH26008 (LJ66JDJ) — "Details updated · 09/07/2026". Labels are server-derived from the chaser
  rows through the deployed SWA→API→Postgres path. Screenshots: ss_9790bojn9, ss_759585fi9.
- **App Insights:** post-deploy bins (12:00→13:27Z) exclusively 200/204 plus one 401 (the no-auth
  smoke probe); zero 5xx after 11:00Z; zero AppExceptions in the 6h window. No error burst.

**Acceptance line 2 — "A.QDOS26029 surfaces one (live)" (the implementer's honest gap — now closed):**
- **SPA render observed by the verifier:** case detail `/case/ac34fae6-1b6f-4af6-b296-660d53631577`
  renders (A.QDOS26029 · SB09XZS · TOYOTA AVENSIS · Missing images · readiness item "no overview with
  a visible registration" — handler-plain). Not-ready queue filtered to the case: one row, Last update
  = "Chased · 10/07/2026", derived from drafted chaser `93dfcb3a-695e-421c-ba44-143e27ddce3c` minted
  12:15:03Z. Screenshots ss_4557i1zrq + ss_27012avb6. All rendered copy handler-plain — no TKT ids, no
  "oneShot", no engineering language staff-visible.
- Ticket evidence cross-checked: both CSVs 31-row consistent; one-shot-run.md full-column capture shows
  status_code 100000000 (drafted), sent_by/sent_at NULL, template `Overview photo request`.

### Pending / gaps
- Expected absences (not bugs): no organic detector mint yet — by design, the one-shot pre-empted the
  entire current corpus (31/31); the next genuinely-new overview-less case is the organic proof. The
  chase audit emits NO AppTraces signal — the organic watch must be the DB query (e), not App Insights.
  ActionLogs feed no longer shows the 12:15Z rows (today's intake flood pushed them past the feed
  window — temporal, not structural).
- Known wording seam (pre-recorded in changes.md): the queue label reads "Chased" while the row is
  still a drafted suggestion — pre-existing shared seam, UI follow-up ticket material.

### Confidence + unread surfaces
High. Unread: the raw GET /api/cases/{id} JSON body (network log captured only OPTIONS preflights;
verifier declined to inject fetch JS into the operator's authed session — the chasers[] read seam is
transitively proven via the server-derived queue label + the offline shared-mapper contract); direct
DB rows (deliberately queued); chrome-devtools MCP was locked by a concurrent instance — all SPA
evidence via claude-in-chrome on the operator's Chrome.

## Orchestrator data-pass W1 (2026-07-10, batched transient-FW window, trap-deleted — only AllowAzureServices remains)

All queued checks confirmed:

- **(a) A.QDOS26029 chaser row:** `93dfcb3a-695e-421c-ba44-143e27ddce3c`, name "Suggested chase — ask
  for a photo of the whole vehicle showing the registration plate clearly.", template
  `Overview photo request`, `status_code=100000000 (drafted)`, `sent_by/sent_at NULL`, drafted
  2026-07-10 12:15:03Z. ✓
- **(b1) overview chasers count:** 31. ✓ **(b2) oneShot audits:** 31. ✓
- **(c) negative control A.PCH26008:** 0 chasers. ✓
- **(d) idempotency dupes:** 0 rows. ✓
- **(e) organic mints:** 0 (expected today). ✓

## Regression verification — 2026-07-11

**Verdict: TESTED (offline) — deployment pending.**

This block supersedes the stale `VERIFIED-LIVE`/done verdict for the PR 55 concurrency and wording
repair. The earlier A.QDOS26029 live suggestion proves the old build, not this repaired one.

- Suggested overview requests have a dedicated suggested flag/audit action and an exact partial
  unique index, preventing concurrent evaluations from creating two active drafts. The detector locks
  and re-reads case lineage, provider and evidence immediately before insert, so a concurrent
  finalise/merge/evidence decision cannot act on the caller's stale snapshot.
- `services/data-api/src/features/cases/overview-chase.test.ts` and `cases-chase.test.ts` cover concurrent/idempotent creation,
  stale-state refusal and distinct suggested versus sent activity.
  `apps/web/src/shared/ui/ChaserPanel.test.ts` covers the existing Overview request remaining
  visible and labelled as drafted, while a sent chase remains chased.
- Deployment proof still required: apply the unique-index delta, deploy API/SPA, rerun concurrent
  evaluation on a prepared overview-less case and confirm one drafted row. Reopen A.QDOS26029 and
  verify its existing suggestion now renders as drafted rather than sent/chased.

## Final independent verification — 2026-07-14

### Verdict

VERIFIED-LIVE

### Evidence

- **Original acceptance 1 — qualifying cases surface a drafted overview chase:** The recorded live
  data pass found 31 qualifying cases at `N=5`, created 31 drafted suggestions and left zero
  candidates. A.QDOS26029 had eight accepted close-ups, zero overview candidates and zero
  unclassified images.
- **Original acceptance 2 — A.QDOS26029 surfaces one live:** Current signed-in production SPA
  verification opened A.QDOS26029 (`ac34fae6-1b6f-4af6-b296-660d53631577`). Its readiness still
  reports no overview with a visible registration. Filtering Not ready for A.QDOS26029 returned
  exactly one row whose current activity reads **“Chase suggested · 10/07/2026.”**
- **Regression 1 — concurrent evaluations create at most one active draft:** PR 55 introduced the
  exact partial unique index and locking/re-read implementation. The July 11 deployment record
  states all ten PR 55 deltas were applied successfully; index creation therefore also proves no
  conflicting active duplicates existed when applied. Concurrent/idempotent behavior is covered by
  the API regression suite.
- **Regression 2 — suggestions appear drafted, never sent:** The current production queue says
  **“Chase suggested,”** replacing the former misleading “Chased” label for A.QDOS26029. prior
  row `93dfcb3a-695e-421c-ba44-143e27ddce3c` is `drafted`, with `sent_by` and `sent_at` null.
- **Regression 3 — sent chases remain chased:** Current source keeps separate suggested/drafted and
  sent wording, with component coverage in `ChaserPanel.test.ts`. No current sent control was opened
  in this pass.
- **Regression 4 — database/API coverage:** `overview-chase.test.ts`, `cases-chase.test.ts` and
  `ChaserPanel.test.ts` cover concurrency, stale-state refusal, idempotency and status-aware wording.
  The repaired API and SPA were deployed July 11 and republished in the July 12 release.
- **Current source/live lineage:** `overview-chase.ts` was last changed by the July 11 locking repair.
  The currently deployed July 12 API is a descendant release containing that repair.

### Pending / gaps

- No production concurrency stimulus was manufactured; the live unique constraint plus offline
  concurrency test is the safety artifact.
- No fresh Postgres query counted current A.QDOS26029 chaser rows because firewall changes were
  prohibited.
- A current genuinely sent chase was not opened as a wording control.
- No organic post-one-shot overview-chase mint was identified; this remains an expected absence
  rather than a failure.

### How to re-verify

1. Open A.QDOS26029 and confirm its existing Overview photo request is labelled suggested/drafted.
2. Read its chaser rows and expect exactly one active `Overview photo request`, `status=drafted`, with
   null send fields.
3. Read the partial unique-index definition and rerun the isolated concurrent-evaluation regression
   test.
4. Open an existing genuinely sent chase and confirm it reads “Chased,” not “Chase suggested.”
5. Watch for the next naturally qualifying case and confirm the deployed detector creates one draft
   without sending it.

### Confidence + unread surfaces

High confidence in the current live suggestion wording, A.QDOS26029 behavior and deployed database
safeguard. Unread surfaces are a fresh database row count, a current sent-chase control and an organic
detector mint.
