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
