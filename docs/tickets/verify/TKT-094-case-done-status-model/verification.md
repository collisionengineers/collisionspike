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
