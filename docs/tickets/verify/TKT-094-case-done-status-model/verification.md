# Verification — TKT-094: Case `done` terminal state — status model + auto-`eva_submitted`

## Verdict
PENDING — Phase A+B code-complete + offline-gated (2026-07-09); awaiting the live DDL delta,
api + SPA deploy, and the live export-flow proof.

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
