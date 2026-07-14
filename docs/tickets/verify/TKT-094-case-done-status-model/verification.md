# Verification — TKT-094: Case `done` terminal state — status model + auto-`eva_submitted`

## Verdict
PENDING — the FAILED is CLEARED (updated ticket-verifier verdict, 10-07-26 evening); deployment
fully certified and acceptance line 1 fully green; lines 2/3 legitimately await the first real
Export-for-EVA (the TKT-095 shape).

Updated certification after the reopen fix (commit 9adca52):
- **1b re-proven by the verifier's OWN run:** `node migration/assets/verify-parity-pg.mjs` at HEAD →
  §1 3/3 PASS + §4 6/6 PASS; §2/§3/§6 print explicit SKIP lines citing the 44268b7 purge. Output:
  [evidence/parity-pg-run-100726.txt](./evidence/parity-pg-run-100726.txt).
- **DDL delta confirmed live (W4):**
  [evidence/w4-ddl-confirmation-100726.txt](./evidence/w4-ddl-confirmation-100726.txt) —
  100000012 done ✓, 100000053 report_delivered ✓, 13 statuses ✓.
- **Caveat / follow-up candidate:** the parity script still exits 1 overall from PRE-EXISTING §5
  classifier drift (existing_provider_diminution absent from email_classifier.py's SUBTYPE_*
  constants; stale hardcoded category count) — outside this ticket's §1/§4 clause; the script cannot
  be wired into CI as-is.

### Prior verdict (2026-07-10 afternoon sweep): FAILED (clause 1b) — details below, fixed same day.

Verified by: ticket-verifier dispatch, 10-07-26. Summary of the certification pass:
- **1a (13/5 parity): PASS** — verifier's own run, 94 tests green; choiceset has 13 options incl.
  done 100000012; terminals = 5; box_synced dropped from the tail, retained as enum.
- **1b (verify-parity-pg.mjs §1/§4 green): FAILED, reproducible** — the script crashes ENOENT at
  module load (unconditional reads of dataverse files purged at 44268b7) before §1 is reached; this
  ticket edited its constants without restoring runnability. Fix is small + offline (follow-up doc).
- **2/3 (export flips, idempotent second click, audit row): PENDING on the first real
  Export-for-EVA** — deployment fully certified: markEvaSubmitted registered live (96 fns),
  unauthenticated probe 401 fail-closed, the deployed route SQL is the guarded idempotent UPDATE,
  the deployed SPA bundle carries both export handlers; KQL over the route's whole deployed life:
  1 request, 0 with 2xx (a probe) — the event has never fired; zero eva_submitted/done cases exist.
- **DDL delta: deployer-claimed**, queued SQL confirms at the next data pass (choice_case_status
  100000012 / choice_audit_action 100000053 / count 13).

## Evidence (offline, 2026-07-09)
- Parity ring at **13 statuses / 5 terminals**: `@cs/domain` vitest **1058 passed (48 files)**
  (case-status.parity.test.ts + case-status.test.ts moved in lockstep; `done` terminal-lock
  cases added). `verify-parity-pg.mjs` §4 updated 11/3 → 13/5; §1 reconciles after the
  audit-event.json 100000035–100000053 drift repair.
- `@cs/api` vitest 335 passed + `tsc -b` clean (new `markEvaSubmitted` route compiles against
  the widened union; `TWIN_TERMINAL` + `done`).
- `mockup-app` vitest 331 passed + `vite build` clean (StatusBadge exhaustive Record forced the
  `done` chip; both export handlers wired).

## Pending / gaps
1. Apply `migration/assets/schema/deltas/2026-07-09-case-done.sql` live (BEFORE the api deploy —
   the status write FK-fails without choice_case_status 100000012).
2. Deploy api + SPA.
3. Live proof: on a `ready_for_eva` case, Export-for-EVA downloads the zip AND flips the badge
   to EVA Submitted; the case leaves Review; Submitted-today / Sent-to-EVA tiles increment;
   second export is a no-op; ONE `eva_submitted` audit row (`GET /api/cases/{id}/activity`).

## How to re-verify
- Offline: `npm run test --workspace @cs/domain` (parity 13/5) + `node verify-all.mjs`.
- DDL: `SELECT code,name FROM choice_case_status WHERE code=100000012;` → done;
  `SELECT code,name FROM choice_audit_action WHERE code=100000053;` → report_delivered.
- Live flow: drive Export for EVA on a seeded `ready_for_eva` case per the ticket's Acceptance.

## Regression verification — 2026-07-11

**Verdict: TESTED (offline) — deployment pending.**

This block supersedes the earlier live/deployed verdicts for the PR 55 atomic-audit repair. Prior
parity and lifecycle evidence describes the older deployed implementation only.

- The 13-status/5-terminal domain and database parity contract remains intact. The repaired staff
  `ready_for_eva → eva_submitted` transition now commits the guarded status update and required audit
  in one transaction through the shared terminal-transition helper.
- `api/src/lib/terminal-transition.test.ts` injects a strict-audit failure, proves the status rolls
  back, retries successfully and proves exactly one final audit. The successful replay is a no-op.
- The same helper is used by staff report delivery and the service-authenticated detector, removing
  the former split between status and audit ownership.
- Deployment proof still required: deploy the API, export one eligible case, verify the badge/queue/
  throughput change and one `eva_submitted` audit, then replay without a second audit.

## Verdict update — 2026-07-14 (independent PLAN-005 sweep; transcribed verbatim)

## Verdict

PENDING

## Evidence

- **A1 — Status parity and offline gates:** `evidence/parity-pg-run-100726.txt` records parity §1 at 3/3
  PASS and §4 at 6/6 PASS, with 13 statuses and five terminals. The live DDL confirmation records
  `done = 100000012` and `report_delivered = 100000053`. The full parity command exited non-zero only
  because of out-of-scope classifier drift in §5. Deployment records report the aggregate verification
  gate passing, but it was not rerun from current `main` in this pass.
- **A2 — First EVA export:** Existing verification records state that no successful live export request
  had yet been observed. There is therefore no artifact proving download, badge transition, Review
  removal and tile increment together.
- **A3 — Replay:** No live second-export attempt and corresponding single `eva_submitted` activity-row
  query were observed.
- **R1 — Atomic terminal transition:** `api/src/lib/terminal-transition.ts:15-45` implements guarded
  terminal status and required audit insertion within the same transaction. The deployed API bundle
  contains the same helper.
- **R2 — Audit failure rollback:** The deployed bundle contains `BEGIN`, `COMMIT` and `ROLLBACK` around
  the strict transition at `deploy/api/main.cjs:16008-16015`;
  `api/src/lib/terminal-transition.test.ts:77-99` records injected-failure coverage.
- **R3 — Replay idempotency:** The terminal helper and regression tests cover terminal replays as no-ops
  without duplicate required audit activity.
- **R4 — Shared helper:** Staff-facing case transitions and internal/detector completion routes use the
  guarded terminal-transition path in `api/src/functions/cases.ts` and `api/src/functions/internal.ts`.
- **R5 — Failure/retry test:** `api/src/lib/terminal-transition.test.ts:77-99` covers failure rollback,
  successful retry and one resulting audit record. The July 11 deployment record reports the repaired API
  published after verification gates passed.

## Pending / gaps

- Acceptance lines A2 and A3 still lack live evidence from a natural staff EVA export.
- No current live trace proves the UI badge, Review queue, completed tile and activity ledger changed
  together.
- No live repeat-export trace proves the request was a no-op with exactly one `eva_submitted` audit row.
- Transaction failure behavior is source- and offline-tested but was not deliberately induced live.
- Current `main` is newer than the deployed API, and the current-tree parity and aggregate verification
  commands were not rerun in this pass.

## How to re-verify

1. On the next ordinary staff export of an existing `ready_for_eva` case, capture the pre-export queue,
   badge, tile and activity state.
2. Capture the successful file download and resulting EVA Submitted badge, Review removal, completed-tile
   increment and single `eva_submitted` activity row.
3. Repeat the export normally and prove no second state transition or audit row is created.
4. Run the status-parity sections and aggregate verification gate from current `main`.
5. Do not inject a production audit failure; retain the focused rollback test as the failure-path
   artifact.

## Confidence + unread surfaces

High confidence in the parity artifact, transaction implementation, regression tests and deployment
lineage; low confidence in completion of the live export acceptance. Unread surfaces are a successful
current live export, its repeat request, associated database/audit rows and signed-in SPA state changes.
