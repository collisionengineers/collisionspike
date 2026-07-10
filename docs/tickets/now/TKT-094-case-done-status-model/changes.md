# Changes — TKT-094: Case `done` terminal state — status model + auto-`eva_submitted`

## Status
Built (2026-07-09, PLAN-003 lifecycle wave) — Phase A + Phase B code-complete on
`feat/lifecycle-wave`; DDL delta authored (apply-before-deploy); deploy + live proof pending.

## Commits
- (uncommitted on `feat/lifecycle-wave` — the dispatching loop owns commits)

## Phase A — status model (parity ring 12 → 13)
- `packages/domain/src/contracts/case-status.ts` — `done` added to the `CaseStatus` union,
  `CASE_STATUSES` (13) and `TERMINAL_STATUSES` (5); header + terminal doc comments updated
  (terminal-lock semantics: the guard returns `done` unchanged; the transition is only ever an
  explicit write guarded `WHERE status_code = eva_submitted`).
- `packages/domain/src/data/choicesets/case-status.json` — option `100000012 done "Done"`;
  `stateMachine.linear` tail is now `… → eva_submitted → done` (**`box_synced` dropped from the
  linear tail** — Box folders are minted at intake; the enum value is retained for history);
  `done` added to `stateMachine.terminals`.
- `migration/assets/schema/000_enums_lookups.sql` — `choice_case_status` +`(100000012,'done','Done')`;
  `choice_audit_action` +`(100000053,'report_delivered','Report Delivered')`; the stale terminals
  header comment corrected.
- **NEW delta** `migration/assets/schema/deltas/2026-07-09-case-done.sql` — idempotent
  (`ON CONFLICT (code) DO NOTHING`), additive, transactional; documents deploy order (apply BEFORE
  the api build that writes 100000012 — the status FK hard-fails without the row).
- **Code-drift note:** the plan reserved `report_delivered = 100000049`, but 100000049–100000052
  were minted since (evidence_added / agent_read / agent_write / image_analysis_generated) —
  `report_delivered` is **100000053**.
- `api/src/lib/audit.ts` — `report_delivered: 100000053` added to `AUDIT_ACTION`.
- Compiler-forced call sites: `packages/domain/src/model/queues.ts` (`caseTypeOf` → `both`;
  `statusToStage` → `submitted` so the funnel/throughput count delivered cases; the
  "Done (today) is not a queue PAGE" comment reframed to the ADR-0023 Completed home);
  `mockup-app/src/components/StatusBadge.tsx` (`done` → green "Done", CheckCircle2);
  `api/src/lib/mappers.ts` (`TWIN_TERMINAL` + `done`).
- Parity gates moved in lockstep: `case-status.parity.test.ts` (12→13),
  `case-status.test.ts` (13 values / 5 terminals + a `done` terminal-lock case + `done` added to
  the guard-order `it.each`), `migration/assets/verify-parity-pg.mjs` §4 (was stale at 11/3 —
  now 13/5).
- **Pre-existing drift repaired:** `packages/domain/src/data/choicesets/audit-event.json` stopped
  at 100000034 while SQL/API ran to 100000052 — appended 100000035–100000053 so
  `verify-parity-pg.mjs` §1 reconciles.

## Phase B — auto-`eva_submitted` on export
- `api/src/functions/cases.ts` — NEW `POST /api/cases/{id}/eva-submitted` (`markEvaSubmitted`,
  `withRole('CollisionSpike.User')`): guarded idempotent
  `UPDATE case_ SET status_code=eva_submitted, submitted_at=now() WHERE id=$1 AND status_code=ready_for_eva`,
  audits `eva_submitted` with the actor from the JWT. Double-click → `{updated:false}`, no
  duplicate audit. This writes `submitted_at` for the first time, making the dashboard
  throughput tiles real (`computeThroughput` already windows on it).
- `mockup-app/src/data/rest-client.ts` — `markEvaSubmitted(id)` on the seam (NOT safe()-wrapped);
  `mock-source.ts` rejects (a faked status flip must never look recorded).
- Call sites (NOTE: the export is now the **ZIP download**, TKT-126 — the plan's line numbers
  predate it):
  - `mockup-app/src/screens/CaseDetail.tsx` `onExportForEva` — after a successful zip download,
    fire `markEvaSubmitted` in its OWN try/catch (a recording failure toasts
    "Exported, but…", never "couldn't export"), then re-read the case so the badge flips.
  - `mockup-app/src/screens/EvaSubmitDialog.tsx` — shared `recordEvaSubmitted()` fired from both
    `onDownloadJson` (after download) and the mock `onSubmit`.

## Offline gates (2026-07-09)
- `@cs/domain` vitest: **1058 passed (48 files)** — parity at 13/5.
- `@cs/api` vitest: **335 passed (34 files)**; `tsc -b` clean both packages.
- `mockup-app` vitest: **331 passed (23 files)**; `vite build` clean.

## Remaining (deploy phase, dispatcher-owned)
1. Apply `deltas/2026-07-09-case-done.sql` live (BEFORE the api deploy).
2. Deploy api + SPA; live proof per verification.md.

## Deploy record — 2026-07-09
DDL delta applied live BEFORE the api deploy (choice_case_status 13 rows; 100000012 `done`,
100000053 `report_delivered` verified by SELECT). api deployed (94 functions — includes
`markEvaSubmitted`); SPA deployed (200 + strict CSP). Route smoke: `POST /api/cases/{id}/eva-submitted`
returns 401 unauthenticated (auth wired). Live export-flow proof (badge flip, tiles, idempotent
second click) awaits a staff session on a `ready_for_eva` case.

## Reopen fix — 2026-07-10 (acceptance clause 1b: verify-parity-pg.mjs runnable, §1/§4 green)
Scope per [evidence/reopen-followup-100726.md](./evidence/reopen-followup-100726.md). Offline-only;
one script touched (`migration/assets/verify-parity-pg.mjs`); no deploys, no live-stack changes;
the 13/5 constants untouched.

1. **Runnability (the ENOENT crash):** the script unconditionally read
   `dataverse/environment-variables.json` + `dataverse/roles/*.json` at module load — files purged
   at 44268b7 (Power Platform teardown, 2026-06-27) — so it crashed before §1. The dataverse-era
   sections (§2/§3/§6) now gate on file existence and print an explicit `SKIP — …` line
   (verify-all.mjs retired-gate style) instead of being deleted: `migration/` is the
   reversible-build home, so a rebuild that restores `dataverse/` re-arms them automatically.
   The summary line counts the skips.
2. **§1 tokenizer fix (found once the script could run at all):** the INSERT-block scan
   terminated at the FIRST `;` — including semicolons inside `--` comments embedded
   mid-VALUES-list (e.g. the terminal-status doc comment above `removed`/`done`) — truncating
   four sets (case_status 11-of-13, audit_action 32-of-54, inbound_category 7-of-8,
   inbound_subtype 10-of-15) and failing §1 against a DDL that is actually complete
   (grep-verified: every "missing" row exists in `000_enums_lookups.sql`). Fix: strip `--` line
   comments before the scan plus a quote-aware terminator (`(?:'[^']*'|[^';])*;`). No label in
   this DDL contains `--` or `;` (grep-verified; constraint noted in-file). The DDL itself was
   not touched.
3. **Run recorded:** `node migration/assets/verify-parity-pg.mjs` from the repo root —
   [evidence/parity-pg-run-100726.txt](./evidence/parity-pg-run-100726.txt). **§1 PASS (3/3
   lines), §4 PASS (6/6 lines — 13 options / 5 terminals)**; §2/§3/§6 SKIP explicitly; §7–10
   skip (no DATABASE_URL set).
4. **Pre-existing §5 drift surfaced, NOT fixed (outside the reopen scope):** the
   classifier-parity checks fail on (a) stale hardcoded counts in the check itself (`3`
   categories / `6` subtypes — the taxonomy is now 8 / 14-in-py), and (b) one real drift:
   `existing_provider_diminution` exists in the choiceset JSON + SQL DDL but has no `SUBTYPE_*`
   constant in the vendored `email_classifier.py` (only the ADR-0021 "D." doc-marker comment).
   Candidate follow-up ticket — needs a taxonomy-ownership decision, then sibling-first
   classifier work (ADR-0018) if the subtype is to be emitted.
